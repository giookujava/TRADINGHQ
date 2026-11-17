"use client";
import { TriangleAlert } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { ActionResult } from "@/lib/validation/common";
import { useToast } from "./toast";
import { cx } from "./ui";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * A <form> bound to a server action with inline error feedback and a success toast.
 * Submits manually (instead of relying on `action=`) so React does not auto-reset the user's input
 * when the server rejects it; `action` stays as the no-JS / pre-hydration fallback (a real POST).
 */
export function ActionForm({
  action, children, className, resetOnSuccess, successText,
}: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; successText?: string }) {
  const t = useT();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const seen = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.ok) {
      toast("success", state.message ?? successText ?? t.common.saved);
      if (resetOnSuccess) ref.current?.reset();
    }
  }, [state, resetOnSuccess, toast, successText, t]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  }

  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className={cx(className, pending && "opacity-70")} aria-busy={pending}>
      {children}
      {state.error ? (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-loss">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> {state.error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Submit button. With `confirm`, the first click opens an accessible confirmation dialog and the
 * confirmed click re-submits the form with this button's name/value.
 */
export function SubmitButton({ children, className, name, value, confirm, confirmLabel }: {
  children: ReactNode; className?: string; name?: string; value?: string; confirm?: string; confirmLabel?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const t = useT();
  const armed = useRef(false);
  return (
    <>
      <button
        ref={ref}
        type="submit"
        name={name}
        value={value}
        className={cx("btn", className)}
        onClick={confirm ? (e) => {
          if (armed.current) { armed.current = false; return; }
          e.preventDefault();
          dialog.current?.showModal();
        } : undefined}
      >
        {children}
      </button>
      {confirm ? (
        <dialog
          ref={dialog}
          className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-fg shadow-pop backdrop:bg-black/50"
          onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}
        >
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loss-soft text-loss"><TriangleAlert className="h-4 w-4" /></div>
              <div>
                <h2 className="font-semibold">{t.common.areYouSure}</h2>
                <p className="mt-1 text-sm text-muted">{confirm}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => dialog.current?.close()}>{t.common.cancel}</button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => { dialog.current?.close(); armed.current = true; setTimeout(() => ref.current?.click(), 0); }}
              >
                {confirmLabel ?? t.common.delete}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
