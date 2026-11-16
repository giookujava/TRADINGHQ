"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Notice } from "@/components/ui";
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_BUCKET, SCREENSHOT_MIME, SCREENSHOT_PHASES, type ScreenshotPhase } from "@/lib/constants";
import type { ScreenshotRow } from "@/lib/db/types";
import { titleCase } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/browser";
import { addScreenshot, updateScreenshot } from "../actions";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export function ScreenshotUploader({ tradeId, userId, supabaseUrl, supabaseKey }: { tradeId: string; userId: string; supabaseUrl: string; supabaseKey: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<ScreenshotPhase>("before");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const supabase = getBrowserClient(supabaseUrl, supabaseKey);
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      if (!SCREENSHOT_MIME.includes(file.type)) { problems.push(`${file.name}: only PNG, JPEG, WebP or GIF.`); continue; }
      if (file.size > MAX_SCREENSHOT_BYTES) { problems.push(`${file.name}: larger than 10 MB.`); continue; }
      const path = `${userId}/${tradeId}/${crypto.randomUUID()}.${EXT[file.type]}`;
      const up = await supabase.storage.from(SCREENSHOT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) { problems.push(`${file.name}: ${up.error.message}`); continue; }
      const res = await addScreenshot({ trade_id: tradeId, storage_path: path, phase, caption });
      if (res.error) problems.push(`${file.name}: ${res.error}`);
    }
    setBusy(false);
    setInputKey((k) => k + 1);
    if (problems.length) setError(problems.join(" "));
    else setCaption("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label">Phase</span>
          <select className="field w-32" value={phase} onChange={(e) => setPhase(e.target.value as ScreenshotPhase)}>
            {SCREENSHOT_PHASES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
          </select>
        </label>
        <label className="block min-w-48 flex-1">
          <span className="label">Description</span>
          <input className="field" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. 5m FVG before entry" maxLength={1000} />
        </label>
        <label className={`btn btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? "Uploading…" : "Upload images"}
          <input key={inputKey} type="file" accept={SCREENSHOT_MIME.join(",")} multiple className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

export function ScreenshotCard({ shot, url }: { shot: ScreenshotRow; url: string | null }) {
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-bg">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL, not optimisable */}
          <img src={url} alt={shot.caption || `${shot.phase} screenshot`} className="aspect-video w-full object-contain bg-black" loading="lazy" />
        </a>
      ) : (
        <div className="flex aspect-video items-center justify-center text-xs text-faint">Image unavailable</div>
      )}
      <figcaption className="p-2">
        <ActionForm action={updateScreenshot}>
          <input type="hidden" name="id" value={shot.id} />
          <div className="flex gap-1.5">
            <select name="phase" defaultValue={shot.phase} className="field w-24 flex-none py-1 text-xs" aria-label="Phase">
              {SCREENSHOT_PHASES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </select>
            <input name="caption" defaultValue={shot.caption} className="field py-1 text-xs" placeholder="Description" aria-label="Description" />
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <SubmitButton className="btn-sm" name="intent" value="save">Save</SubmitButton>
            <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm="Delete this screenshot permanently?">Delete</SubmitButton>
          </div>
        </ActionForm>
      </figcaption>
    </figure>
  );
}
