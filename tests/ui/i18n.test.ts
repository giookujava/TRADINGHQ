import { describe, expect, it } from "vitest";
import { en, fmt } from "@/lib/i18n/en";
import { ka } from "@/lib/i18n/ka";
import { getDict, isLocale } from "@/lib/i18n";

type Tree = { [k: string]: string | Tree };
function leaves(o: Tree, prefix = ""): [string, string][] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n dictionaries", () => {
  const E = new Map(leaves(en as unknown as Tree));
  const K = new Map(leaves(ka as unknown as Tree));

  it("Georgian has exactly the same keys as English", () => {
    expect([...K.keys()].sort()).toEqual([...E.keys()].sort());
  });
  it("no empty strings", () => {
    for (const [k, v] of [...E, ...K]) expect(v.trim(), k).not.toBe("");
  });
  it("placeholders match between languages", () => {
    for (const [k, v] of E) expect(placeholders(K.get(k) ?? ""), k).toEqual(placeholders(v));
  });
  it("fmt substitutes and leaves unknown placeholders visible", () => {
    expect(fmt("{n} trades · {x}", { n: 5 })).toBe("5 trades · {x}");
  });
  it("defaults to English", () => {
    expect(isLocale("fr")).toBe(false);
    expect(getDict("en").meta.lang).toBe("en");
    expect(getDict("ka").meta.lang).toBe("ka");
  });
});
