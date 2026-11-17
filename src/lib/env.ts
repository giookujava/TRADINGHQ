/**
 * Public Supabase configuration. Both values are safe to expose to the browser:
 * data is protected by Row Level Security, not by hiding the key.
 * Secret keys (service role, AI, broker) must NEVER be read from NEXT_PUBLIC_* vars.
 */
export function supabaseEnv(): { url: string; key: string } | null {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!configuredUrl || !key || configuredUrl.includes("your-project") || key.startsWith("your-")) return null;
  const url = configuredUrl.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
  return { url, key };
}

export function requireSupabaseEnv(): { url: string; key: string } {
  const env = supabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL " +
        "and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }
  return env;
}
