"use client";
import { useActionState, useState } from "react";
import { Notice } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { signIn, signUp, type AuthState } from "./actions";

export function LoginForm({ initialError }: { initialError?: string }) {
  const t = useT();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, { error: initialError });
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "signin" ? inState : upState;
  const pending = inPending || upPending;

  return (
    <form action={mode === "signin" ? inAction : upAction} className="space-y-4 p-5">
      <div className="flex rounded-2xl border border-line bg-surface-2 p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-xl px-3 py-2 font-bold transition-colors ${mode === m ? "bg-accent text-accent-fg shadow-glow" : "text-muted hover:text-fg"}`}
          >
            {m === "signin" ? t.login.signIn : t.login.createAccount}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="label">{t.login.email}</span>
        <input name="email" type="email" autoComplete="email" required className="field" />
      </label>
      <label className="block">
        <span className="label">{t.login.password}</span>
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
      <button type="submit" disabled={pending} className="btn btn-primary h-11 w-full">
        {pending ? t.login.wait : mode === "signin" ? t.login.signIn : t.login.createAccount}
      </button>
      {mode === "signup" ? (
        <p className="text-[11px] leading-relaxed text-faint">
          {t.login.singleUser}
        </p>
      ) : null}
    </form>
  );
}
