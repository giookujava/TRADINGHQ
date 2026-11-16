import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-semibold tracking-[0.2em]">
            TRADING <span className="text-accent">HQ</span>
          </div>
          <div className="mt-1 text-sm text-muted">Private trading journal & analytics</div>
        </div>
        <LoginForm initialError={error} />
      </div>
    </main>
  );
}
