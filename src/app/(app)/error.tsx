"use client";
import { OctagonAlert, RotateCcw } from "lucide-react";

/** Route-level error state. Shows the message (no stack) and lets the user retry. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-xl border border-line bg-surface p-6 text-center shadow-card">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-loss-soft text-loss">
        <OctagonAlert className="h-5 w-5" />
      </div>
      <h1 className="font-semibold">Something went wrong loading this page</h1>
      <p className="mt-1 text-sm text-muted">{error.message || "Unexpected error."}</p>
      {error.digest ? <p className="num mt-1 text-xs text-faint">ref {error.digest}</p> : null}
      <p className="mt-2 text-xs text-faint">Your data has not been changed.</p>
      <button type="button" className="btn btn-primary mt-4" onClick={reset}>
        <RotateCcw className="h-4 w-4" /> Try again
      </button>
    </div>
  );
}
