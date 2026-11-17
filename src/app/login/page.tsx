import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-switcher";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const t = await getT();
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute top-4 right-4 flex items-center gap-1 rounded-2xl border border-line bg-surface p-1">
        <LanguageSwitcher className="h-9 border-0 bg-transparent p-0.5" />
        <ThemeToggle className="h-9 w-9" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo className="h-12 sm:h-14" />
          <div className="mt-4 text-[15px] text-muted">{t.login.tagline}</div>
        </div>
        <div className="panel p-1.5"><LoginForm initialError={error} /></div>
        <p className="mt-6 text-center text-xs text-faint">{t.login.privacy}</p>
      </div>
    </main>
  );
}
