"use client";
import { useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import type { ActionResult } from "@/lib/validation/common";
import { generateSampleData, removeSampleData } from "./actions";

export function SampleDataControls({ hasSample }: { hasSample: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => setResult(await fn()));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={pending || hasSample} onClick={() => run(generateSampleData)}>
          {pending ? "Working…" : "Generate sample data"}
        </button>
        <button type="button" className="btn btn-danger" disabled={pending || !hasSample}
          onClick={() => run(removeSampleData, "Delete ALL sample trades, sample preparations and the sample account? Your real records are not affected.")}>
          Remove sample data
        </button>
      </div>
      {result?.error ? <Notice tone="error">{result.error}</Notice> : null}
      {result?.ok ? <Notice tone="success">{result.message}</Notice> : null}
    </div>
  );
}
