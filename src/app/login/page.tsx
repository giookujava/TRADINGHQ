import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute top-4 right-4"><ThemeSwitcher compact /></div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo className="h-12 sm:h-14" />
          <div className="mt-4 text-sm text-muted">Your private trading journal & performance analytics</div>
        </div>
        <LoginForm initialError={error} />
        <p className="mt-6 text-center text-xs text-faint">Data is private to your account and protected by row-level security.</p>
      </div>
    </main>
  );
}
