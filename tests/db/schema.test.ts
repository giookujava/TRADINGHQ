/**
 * Runs the real Phase 1 migration against PGlite (Postgres compiled to WASM) with a
 * minimal Supabase stub, then proves RLS isolation, ownership guards and save_trade.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(root, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of ["0001_phase1_foundation.sql", "0002_api_grants.sql"]) {
    await db.exec(readFileSync(join(root, "supabase/migrations", f), "utf8"));
  }
  // Grants now come from 0002; keep storage grants for the stub.
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
                 grant select, insert, update, delete on storage.objects to authenticated;`);
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@test.local'), ('${B}', 'b@test.local');`);
}, 60_000);

async function makeAccount(uid: string, name: string) {
  const r = await db.query<{ id: string }>(
    `insert into accounts (user_id, name, account_type) values ($1, $2, 'backtest') returning id`,
    [uid, name],
  );
  return r.rows[0].id;
}
async function instrumentId(symbol: string) {
  const r = await db.query<{ id: string }>(`select id from instruments where symbol = $1`, [symbol]);
  expect(r.rows.length).toBe(1);
  return r.rows[0].id;
}
const exec1 = JSON.stringify([{ executed_at: "2026-03-09T14:31:00Z", side: "buy", quantity: 1, price: 1 }]);

describe("phase 1 migration", () => {
  it("seeds a profile and 12 instruments per new user", async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int n from instruments where user_id = $1`, [A]);
    expect(r.rows[0].n).toBe(12);
    const p = await db.query<{ trading_timezone: string }>(
      `select trading_timezone from profiles where id = $1`,
      [A],
    );
    expect(p.rows[0].trading_timezone).toBe("America/New_York");
  });

  it("rejects inconsistent tick specs", async () => {
    await expect(
      db.query(
        `insert into instruments (user_id, symbol, tick_size, tick_value, point_value) values ($1,'BAD',0.25,1,2)`,
        [A],
      ),
    ).rejects.toThrow();
  });

  it("RLS: users only see and modify their own rows", async () => {
    const rowsA = await as(A, () => db.query(`select * from instruments`));
    expect(rowsA.rows.length).toBe(12);
    const accA = await as(A, () => makeAccount(A, "A backtest"));
    await as(B, () => makeAccount(B, "B backtest"));

    const seenByB = await as(B, () => db.query(`select * from accounts where id = $1`, [accA]));
    expect(seenByB.rows.length).toBe(0);
    const upd = await as(B, () => db.query(`update accounts set name = 'hacked' where id = $1`, [accA]));
    expect(upd.affectedRows ?? 0).toBe(0);
    const del = await as(B, () => db.query(`delete from accounts where id = $1`, [accA]));
    expect(del.affectedRows ?? 0).toBe(0);
    const still = await db.query<{ name: string }>(`select name from accounts where id = $1`, [accA]);
    expect(still.rows[0].name).toBe("A backtest");
    // B cannot insert rows owned by A
    await expect(
      as(B, () => db.query(`insert into accounts (user_id, name, account_type) values ($1, 'x', 'demo')`, [A])),
    ).rejects.toThrow();
    // anon has no table privileges at all
    await db.exec(`set role anon;`);
    await expect(db.query(`select * from accounts`)).rejects.toThrow();
    await db.exec(`reset role;`);
  });

  it("save_trade upserts trade + executions + tags atomically and blocks cross-user writes", async () => {
    const accA = (await db.query<{ id: string }>(`select id from accounts where user_id = $1`, [A])).rows[0].id;
    const accB = (await db.query<{ id: string }>(`select id from accounts where user_id = $1`, [B])).rows[0].id;

    const tradeId = await as(A, async () => {
      const mnq = await instrumentId("MNQ");
      const tag = await db.query<{ id: string }>(
        `insert into tags (user_id, name, category) values ($1,'FVG','concept') returning id`,
        [A],
      );
      const trade = {
        account_id: accA, instrument_id: mnq, trade_date: "2026-03-09", direction: "long",
        trade_type: "backtest", gross_pnl: 80, net_pnl: 75.04, total_fees: 4.96,
      };
      const execs = [
        { executed_at: "2026-03-09T14:31:00Z", side: "buy", quantity: 2, price: 18000, fees: 2.48 },
        { executed_at: "2026-03-09T14:45:00Z", side: "sell", quantity: 2, price: 18020, fees: 2.48 },
      ];
      const r = await db.query<{ id: string }>(`select save_trade($1::jsonb, $2::jsonb, $3::uuid[]) id`, [
        JSON.stringify(trade), JSON.stringify(execs), [tag.rows[0].id],
      ]);
      return r.rows[0].id;
    });

    const q = `select user_id, net_pnl::text, source, is_sample,
                 (select count(*)::int from trade_executions where trade_id = t.id) n,
                 (select count(*)::int from trade_tags where trade_id = t.id) tags
               from trades t where id = $1`;
    expect((await db.query(q, [tradeId])).rows[0]).toMatchObject({
      user_id: A, net_pnl: "75.04", n: 2, tags: 1, source: "manual", is_sample: false,
    });

    // update path replaces executions and tags
    await as(A, async () => {
      const mnq = await instrumentId("MNQ");
      await db.query(`select save_trade($1::jsonb, $2::jsonb, $3::uuid[])`, [
        JSON.stringify({ id: tradeId, account_id: accA, instrument_id: mnq, trade_date: "2026-03-09",
          direction: "long", trade_type: "backtest", net_pnl: 10 }),
        exec1, [],
      ]);
    });
    expect((await db.query(q, [tradeId])).rows[0]).toMatchObject({ net_pnl: "10.00", n: 1, tags: 0 });

    // B cannot overwrite A's trade id
    await expect(
      as(B, async () => {
        const mnqB = await instrumentId("MNQ");
        await db.query(`select save_trade($1::jsonb, $2::jsonb, null)`, [
          JSON.stringify({ id: tradeId, account_id: accB, instrument_id: mnqB, trade_date: "2026-03-09",
            direction: "long", trade_type: "backtest" }),
          exec1,
        ]);
      }),
    ).rejects.toThrow();
    expect((await db.query(q, [tradeId])).rows[0]).toMatchObject({ user_id: A, net_pnl: "10.00" });

    // B cannot attach its trade to A's account
    await expect(
      as(B, async () => {
        const mnqB = await instrumentId("MNQ");
        await db.query(`select save_trade($1::jsonb, $2::jsonb, null)`, [
          JSON.stringify({ account_id: accA, instrument_id: mnqB, trade_date: "2026-03-09",
            direction: "long", trade_type: "backtest" }),
          exec1,
        ]);
      }),
    ).rejects.toThrow(/does not belong/);

    // a trade needs executions
    await expect(
      as(A, async () => {
        const mnq = await instrumentId("MNQ");
        await db.query(`select save_trade($1::jsonb, '[]'::jsonb, null)`, [
          JSON.stringify({ account_id: accA, instrument_id: mnq, trade_date: "2026-03-09",
            direction: "long", trade_type: "backtest" }),
        ]);
      }),
    ).rejects.toThrow(/at least one execution/);
  });

  it("imports are idempotent via (source, external_id)", async () => {
    const accA = (await db.query<{ id: string }>(`select id from accounts where user_id = $1`, [A])).rows[0].id;
    await as(A, async () => {
      const mnq = await instrumentId("MNQ");
      const t = JSON.stringify({ account_id: accA, instrument_id: mnq, trade_date: "2026-03-10",
        direction: "long", trade_type: "live", source: "tradovate", external_id: "ord-1" });
      await db.query(`select save_trade($1::jsonb, $2::jsonb, null)`, [t, exec1]);
      await expect(db.query(`select save_trade($1::jsonb, $2::jsonb, null)`, [t, exec1])).rejects.toThrow();
    });
  });

  it("storage policies restrict objects to the owner's folder", async () => {
    await as(A, () =>
      db.query(`insert into storage.objects (bucket_id, name) values ('trade-screenshots', $1)`, [`${A}/t1/x.png`]),
    );
    await expect(
      as(A, () =>
        db.query(`insert into storage.objects (bucket_id, name) values ('trade-screenshots', $1)`, [`${B}/t1/x.png`]),
      ),
    ).rejects.toThrow();
    const seen = await as(B, () => db.query(`select * from storage.objects`));
    expect(seen.rows.length).toBe(0);
  });

  it("daily prep is unique per date (+instrument)", async () => {
    await as(A, () => db.query(`insert into daily_preps (user_id, prep_date) values ($1, '2026-03-09')`, [A]));
    await expect(
      as(A, () => db.query(`insert into daily_preps (user_id, prep_date) values ($1, '2026-03-09')`, [A])),
    ).rejects.toThrow();
  });
});
