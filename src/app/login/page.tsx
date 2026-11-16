import type { Metadata } from "next";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute top-4 right-4"><ThemeSwitcher compact /></div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-pop">
            <svg viewBox="0 0 16 16" className="h-6 w-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12 6 7.5l3 2.5L14 4" />
              <path d="M10.5 4H14v3.5" />
            </svg>
          </span>
          <div className="text-lg font-semibold tracking-[0.16em]">
            TRADING <span className="text-accent">HQ</span>
          </div>
          <div className="mt-1 text-sm text-muted">Your private trading journal & performance analytics</div>
        </div>
        <LoginForm initialError={error} />
        <p className="mt-6 text-center text-xs text-faint">Data is private to your account and protected by row-level security.</p>
      </div>
    </main>
  );
}
