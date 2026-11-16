import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { supabaseEnv } from "@/lib/env";

export const metadata = { title: "Setup required" };

/** Shown only while Supabase environment variables are missing. */
export default function SetupPage() {
  if (supabaseEnv()) redirect("/");
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <BrandLogo className="h-10" />
      <h1 className="mt-6 text-lg font-semibold">Supabase is not configured yet</h1>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>Create a free project at supabase.com.</li>
        <li>
          In the SQL Editor, run <code className="num text-fg">supabase/migrations/0001_phase1_foundation.sql</code>.
        </li>
        <li>
          Copy <code className="num text-fg">.env.example</code> to <code className="num text-fg">.env.local</code> and fill
          in the project URL and publishable (anon) key from Project Settings → API.
        </li>
        <li>Restart <code className="num text-fg">npm run dev</code>.</li>
      </ol>
      <p className="mt-6 text-sm text-faint">Full instructions: README.md → “Setup”.</p>
    </main>
  );
}
