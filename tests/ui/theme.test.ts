import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { themeInitScript } from "@/lib/theme";

/** Execute the inline <head> script against a fake browser environment. */
function run(stored: Record<string, string>, prefersDark: boolean, throwOnStorage = false) {
  const dataset: Record<string, string> = {};
  const ctx = {
    localStorage: {
      getItem: (k: string) => {
        if (throwOnStorage) throw new Error("blocked");
        return stored[k] ?? null;
      },
    },
    matchMedia: () => ({ matches: prefersDark }),
    document: { documentElement: { dataset } },
  };
  runInNewContext(themeInitScript, ctx);
  return dataset;
}

describe("theme init script (no-flash)", () => {
  it("defaults to system preference", () => {
    expect(run({}, true)).toMatchObject({ theme: "dark", themePref: "system" });
    expect(run({}, false)).toMatchObject({ theme: "light", themePref: "system" });
  });
  it("respects an explicit stored choice regardless of OS", () => {
    expect(run({ "thq-theme": "light" }, true)).toMatchObject({ theme: "light", themePref: "light" });
    expect(run({ "thq-theme": "dark" }, false)).toMatchObject({ theme: "dark", themePref: "dark" });
  });
  it("restores the collapsed sidebar", () => {
    expect(run({ "thq-sidebar": "collapsed" }, false).sidebar).toBe("collapsed");
    expect(run({ "thq-sidebar": "expanded" }, false).sidebar).toBeUndefined();
  });
  it("falls back to dark when storage is unavailable", () => {
    expect(run({}, false, true).theme).toBe("dark");
  });
});
