import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase environment", () => {
  it("removes an accidental Data API path from the project URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/rest/v1/");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    expect(supabaseEnv()).toEqual({
      url: "https://project.supabase.co",
      key: "sb_publishable_test",
    });
  });

  it("preserves the bare project URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    expect(supabaseEnv()?.url).toBe("https://project.supabase.co");
  });
});
