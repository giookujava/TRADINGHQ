"use client";
import { useActionState, useState } from "react";
import { Notice } from "@/components/ui";
import { signIn, signUp, type AuthState } from "./actions";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, { error: initialError });
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "signin" ? inState : upState;
  const pending = inPending || upPending;

  return (
    <form action={mode === "signin" ? inAction : upAction} className="card space-y-4 p-6 shadow-pop">
      <div className="flex rounded-lg border border-line bg-surface-2 p-0.5 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === m ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" autoComplete="email" required className="field" />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={8}
          required
          className="field"
        />
      </label>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      {mode === "signup" ? (
        <p className="text-[11px] leading-relaxed text-faint">
          TRADING HQ is single-user. After creating your account, disable new sign-ups in Supabase
          (Authentication → Sign In / Providers → “Allow new users to sign up”).
        </p>
      ) : null}
    </form>
  );
}
