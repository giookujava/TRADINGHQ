import { Library, Pin, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Badge, Empty, Notice, PageHeader, cx } from "@/components/ui";
import { KNOWLEDGE_KINDS } from "@/lib/constants";
import type { KnowledgeEntry } from "@/lib/db/types";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Strategy & Knowledge" };

export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" && (KNOWLEDGE_KINDS as readonly string[]).includes(sp.kind) ? sp.kind : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const { supabase } = await requireUser();
  const t = await getT();
  const K = t.knowledge;
  let query = supabase.from("knowledge_entries").select("id,title,kind,body,concept_key,strategy_id,tag_id,pinned,updated_at").order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(500);
  if (kind) query = query.eq("kind", kind);
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, " ")}%,body.ilike.%${q.replace(/[%,()]/g, " ")}%`);
  const { data, error } = await query;
  const entries = (data ?? []) as KnowledgeEntry[];
  const kinds = K.kinds as Record<string, string>;

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title={K.title} subtitle={K.subtitle}
        actions={<Link href="/knowledge/new" className="btn btn-primary h-12 px-6 text-[15px]"><Plus className="h-5 w-5" /> {K.newEntry}</Link>} />

      {error ? <Notice tone="warn" className="mb-5">{t.finance.migration}</Notice> : null}

      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <form method="get" className="relative w-full max-w-sm">
          {kind ? <input type="hidden" name="kind" value={kind} /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input name="q" defaultValue={q} placeholder={K.search} aria-label={K.search} className="field h-11 rounded-2xl pl-10" />
        </form>
        <div className="flex flex-wrap gap-1.5">
          <Link href={q ? `/knowledge?q=${encodeURIComponent(q)}` : "/knowledge"} className={cx("chip h-9 rounded-xl text-xs", !kind && "border-accent bg-accent-soft text-accent")}>{t.common.all}</Link>
          {KNOWLEDGE_KINDS.map((k) => (
            <Link key={k} href={`/knowledge?kind=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={cx("chip h-9 rounded-xl text-xs", kind === k && "border-accent bg-accent-soft text-accent")}>{kinds[k]}</Link>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <Empty icon={<Library className="h-5 w-5" />} title={q || kind ? K.noMatch : K.emptyTitle}
          action={<Link href="/knowledge/new" className="btn btn-primary">{K.newEntry}</Link>}>{K.emptyHint}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((e) => (
            <Link key={e.id} href={`/knowledge/${e.id}`} className="card group flex flex-col gap-3 p-5 transition-colors hover:border-accent/50">
              <div className="flex items-start justify-between gap-2">
                <Badge tone="accent">{kinds[e.kind]}</Badge>
                {e.pinned ? <Pin className="h-4 w-4 text-accent" aria-label={K.pinned} /> : null}
              </div>
              <h2 className="text-lg font-bold leading-snug group-hover:text-accent">{e.title}</h2>
              <p className="line-clamp-3 text-sm text-muted">{e.body || "—"}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 text-xs text-faint">
                {e.concept_key ? <Badge>{t.labels.ict[e.concept_key]}</Badge> : null}
                <span className="ml-auto">{e.updated_at.slice(0, 10)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
