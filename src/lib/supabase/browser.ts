"use client";
import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser client — used only for direct-to-Storage screenshot uploads (RLS-protected). */
export function getBrowserClient(url: string, key: string) {
  if (!client) client = createBrowserClient(url, key);
  return client;
}
