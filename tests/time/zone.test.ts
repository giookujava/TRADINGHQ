import { describe, expect, it } from "vitest";
import { classifySession, dateInZone, localDateTimeInZone, zonedTimeToUtc } from "@/lib/time/zone";

const NY = "America/New_York";
const TBS = "Asia/Tbilisi";

describe("zonedTimeToUtc (America/New_York)", () => {
  it("winter (EST, UTC−5)", () => {
    expect(zonedTimeToUtc("2026-01-15T09:30", NY).toISOString()).toBe("2026-01-15T14:30:00.000Z");
  });
  it("summer (EDT, UTC−4)", () => {
    expect(zonedTimeToUtc("2026-07-15T09:30", NY).toISOString()).toBe("2026-07-15T13:30:00.000Z");
  });
  it("day after spring-forward (2026-03-08)", () => {
    expect(zonedTimeToUtc("2026-03-09T09:30", NY).toISOString()).toBe("2026-03-09T13:30:00.000Z");
    expect(zonedTimeToUtc("2026-03-07T09:30", NY).toISOString()).toBe("2026-03-07T14:30:00.000Z");
  });
  it("spring-forward gap 02:30 resolves forward to 03:30 EDT", () => {
    expect(zonedTimeToUtc("2026-03-08T02:30", NY).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });
  it("fall-back ambiguous 01:30 resolves to the first (EDT) occurrence", () => {
    expect(zonedTimeToUtc("2026-11-01T01:30", NY).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("seconds supported; round-trips", () => {
    const d = zonedTimeToUtc("2026-05-04T15:59:30", NY);
    expect(localDateTimeInZone(d, NY)).toBe("2026-05-04T15:59:30");
  });
  it("rejects garbage", () => {
    expect(() => zonedTimeToUtc("09:30", NY)).toThrow();
  });
});

describe("New York ↔ Tbilisi (no manual math needed)", () => {
  it("09:30 NY is 18:30 Tbilisi in winter and 17:30 in summer", () => {
    expect(localDateTimeInZone(zonedTimeToUtc("2026-01-15T09:30", NY), TBS, false)).toBe("2026-01-15T18:30");
    expect(localDateTimeInZone(zonedTimeToUtc("2026-07-15T09:30", NY), TBS, false)).toBe("2026-07-15T17:30");
  });
  it("trade date follows NY calendar", () => {
    // 23:30 NY on Jan 15 is already Jan 16 in UTC and Tbilisi
    const d = zonedTimeToUtc("2026-01-15T23:30", NY);
    expect(dateInZone(d, NY)).toBe("2026-01-15");
    expect(dateInZone(d, TBS)).toBe("2026-01-16");
  });
});

describe("classifySession", () => {
  const at = (s: string) => classifySession(zonedTimeToUtc(s, NY));
  it("maps NY wall-clock to sessions in both DST regimes", () => {
    expect(at("2026-01-15T20:30")).toBe("asia");
    expect(at("2026-01-15T01:59")).toBe("asia");
    expect(at("2026-01-15T03:00")).toBe("london");
    expect(at("2026-07-15T09:30")).toBe("ny_am");
    expect(at("2026-07-15T12:30")).toBe("ny_lunch");
    expect(at("2026-07-15T14:00")).toBe("ny_pm");
    expect(at("2026-07-15T17:30")).toBe("other");
  });
});
