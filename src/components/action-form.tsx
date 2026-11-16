"use client";
import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "@/lib/validation/common";
import { cx } from "./ui";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * A <form> bound to a server action with inline error/success feedback.
 * Submits manually (instead of `action=`) so React does not auto-reset the user's input
 * when the server rejects it. `resetOnSuccess` clears the form after a successful create.
 */
export function ActionForm({
  action, children, className, resetOnSuccess, successText = "Saved.",
}: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; successText?: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  }

  return (
    // `action` is the no-JS / pre-hydration fallback (a real POST); after hydration onSubmit handles it.
    <form ref={ref} action={formAction} onSubmit={onSubmit} className={cx(className, pending && "opacity-70")} aria-busy={pending}>
      {children}
      {state.error ? <p role="alert" className="mt-2 text-xs text-loss">{state.error}</p> : null}
      {state.ok && !state.error ? <p className="mt-2 text-xs text-profit">{state.message ?? successText}</p> : null}
    </form>
  );
}

export function SubmitButton({ children, className, name, value, confirm }: {
  children: ReactNode; className?: string; name?: string; value?: string; confirm?: string;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={cx("btn", className)}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {children}
    </button>
  );
}
