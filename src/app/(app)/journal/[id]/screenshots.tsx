"use client";
import { ImagePlus, LoaderCircle, Maximize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { useToast } from "@/components/toast";
import { Notice, cx } from "@/components/ui";
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_BUCKET, SCREENSHOT_MIME, SCREENSHOT_PHASES, type ScreenshotPhase } from "@/lib/constants";
import type { ScreenshotRow } from "@/lib/db/types";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { getBrowserClient } from "@/lib/supabase/browser";
import { addScreenshot, updateScreenshot } from "../actions";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** Uploads straight to the user's private Storage folder (RLS-protected), then records metadata. */
export function ScreenshotUploader({ tradeId, userId, supabaseUrl, supabaseKey }: { tradeId: string; userId: string; supabaseUrl: string; supabaseKey: string }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [phase, setPhase] = useState<ScreenshotPhase>("before");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  async function upload(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setError(null);
    setBusy(true);
    const supabase = getBrowserClient(supabaseUrl, supabaseKey);
    const problems: string[] = [];
    let ok = 0;
    for (const file of list) {
      if (!SCREENSHOT_MIME.includes(file.type)) { problems.push(fmt(t.shots.typeErr, { f: file.name })); continue; }
      if (file.size > MAX_SCREENSHOT_BYTES) { problems.push(fmt(t.shots.sizeErr, { f: file.name })); continue; }
      const path = `${userId}/${tradeId}/${crypto.randomUUID()}.${EXT[file.type]}`;
      const up = await supabase.storage.from(SCREENSHOT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) { problems.push(`${file.name}: ${up.error.message}`); continue; }
      const res = await addScreenshot({ trade_id: tradeId, storage_path: path, phase, caption });
      if (res.error) problems.push(`${file.name}: ${res.error}`);
      else ok++;
    }
    setBusy(false);
    setInputKey((k) => k + 1);
    if (problems.length) setError(problems.join(" "));
    else setCaption("");
    if (ok) toast("success", fmt(t.shots.uploaded, { n: ok }));
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
        <label className="block">
          <span className="label">{t.shots.phase}</span>
          <select className="field" value={phase} onChange={(e) => setPhase(e.target.value as ScreenshotPhase)}>
            {SCREENSHOT_PHASES.map((p) => <option key={p} value={p}>{t.labels.phases[p]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">{t.shots.description}</span>
          <input className="field" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t.shots.placeholder} maxLength={1000} />
        </label>
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-7 text-center transition-colors",
          drag ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2 hover:border-accent/60",
          busy && "pointer-events-none opacity-70",
        )}
      >
        {busy ? <LoaderCircle className="h-5 w-5 animate-spin text-accent" /> : <ImagePlus className="h-5 w-5 text-accent" />}
        <span className="text-sm font-medium">{busy ? t.shots.uploading : t.shots.drop}</span>
        <span className="text-xs text-faint">{t.shots.dropHint}</span>
        <input key={inputKey} type="file" accept={SCREENSHOT_MIME.join(",")} multiple className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files)} />
      </label>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

export function ScreenshotCard({ shot, url }: { shot: ScreenshotRow; url: string | null }) {
  const t = useT();
  return (
    <figure className="group overflow-hidden rounded-2xl border border-line bg-surface-2">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title={t.shots.openFull} className="relative block">
          {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL, not optimisable */}
          <img src={url} alt={shot.caption || `${shot.phase} screenshot`} className="aspect-video w-full bg-black object-contain" loading="lazy" />
          <span className="absolute top-2 right-2 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"><Maximize2 className="h-3.5 w-3.5" /></span>
        </a>
      ) : (
        <div className="flex aspect-video items-center justify-center text-xs text-faint">{t.shots.unavailable}</div>
      )}
      <figcaption className="p-2.5">
        {shot.caption ? <p className="mb-2 text-sm">{shot.caption}</p> : null}
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-fg">{t.shots.editMeta}</summary>
          <ActionForm action={updateScreenshot} className="mt-2">
            <input type="hidden" name="id" value={shot.id} />
            <div className="flex gap-1.5">
              <select name="phase" defaultValue={shot.phase} className="field w-24 flex-none py-1 text-xs" aria-label={t.shots.phase}>
                {SCREENSHOT_PHASES.map((p) => <option key={p} value={p}>{t.labels.phases[p]}</option>)}
              </select>
              <input name="caption" defaultValue={shot.caption} className="field py-1 text-xs" placeholder={t.shots.description} aria-label={t.shots.description} />
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <SubmitButton className="btn-sm" name="intent" value="save">{t.common.save}</SubmitButton>
              <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm={t.shots.deleteConfirm} confirmLabel={t.shots.deleteShot}>{t.common.delete}</SubmitButton>
            </div>
          </ActionForm>
        </details>
      </figcaption>
    </figure>
  );
}
