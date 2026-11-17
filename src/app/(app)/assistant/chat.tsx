"use client";
import { ArrowUp, Bot, LoaderCircle, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";

export interface ChatMsg { id?: string; role: "user" | "assistant"; content: string; cost?: number; tools?: string[] }

/** Inline markdown: **bold**, `code`, links — only internal /journal|/knowledge|/prep links become links. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0, k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const s = m[0];
    if (s.startsWith("**")) out.push(<strong key={k++}>{s.slice(2, -2)}</strong>);
    else if (s.startsWith("`")) out.push(<code key={k++} className="rounded bg-surface-3 px-1 font-mono text-[0.9em]">{s.slice(1, -1)}</code>);
    else {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(s)!;
      if (/^\/(journal|knowledge|prep)\/[0-9a-zA-Z-]+$/.test(href)) out.push(<Link key={k++} href={href} className="font-semibold text-accent underline-offset-2 hover:underline">{label}</Link>);
      else out.push(label);
    }
    last = m.index + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LIST = /^\s*([-*]|\d+\.)\s+/;
const ROW = /^\s*\|.*\|\s*$/;

function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (ROW.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && ROW.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split("|").map((c) => c.trim()));
        i++;
      }
      const [head = [], ...body] = rows;
      blocks.push(
        <div key={k++} className="overflow-x-auto"><table className="table text-sm">
          <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, n) => <td key={n} className="num">{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { blocks.push(<h3 key={k++} className={cx("font-bold", h[1].length <= 2 ? "text-base" : "text-sm")}>{inline(h[2])}</h3>); i++; continue; }
    if (LIST.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length && LIST.test(lines[i])) { items.push(lines[i].replace(LIST, "")); i++; }
      blocks.push(ordered
        ? <ol key={k++} className="list-decimal space-y-1 pl-5">{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ol>
        : <ul key={k++} className="list-disc space-y-1 pl-5">{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,4}\s/.test(lines[i]) && !LIST.test(lines[i]) && !ROW.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={k++}>{para.map((p, j) => <Fragment key={j}>{j ? <br /> : null}{inline(p)}</Fragment>)}</p>);
  }
  return <div className="space-y-3 text-[15px] leading-relaxed">{blocks}</div>;
}

export function Chat({ conversationId, initial, disabled }: { conversationId: string | null; initial: ChatMsg[]; disabled: boolean }) {
  const t = useT();
  const A = t.assistant;
  const errs = A.errors as Record<string, string>;
  const router = useRouter();
  const [msgs, setMsgs] = useState<ChatMsg[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef(conversationId);
  const box = useRef<HTMLDivElement>(null);
  // Scroll only the message list (scrollIntoView would also scroll the page).
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, busy, error]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy || disabled) return;
    setError(null); setBusy(true); setText("");
    setMsgs((x) => [...x, { role: "user", content: m }]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId.current, message: m }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.conversationId && !convId.current) {
        convId.current = j.conversationId;
        window.history.replaceState(null, "", `/assistant?c=${j.conversationId}`);
      }
      if (!res.ok) setError(fmt(errs[j.error] ?? errs.generic, { m: j.message ?? "" }));
      else setMsgs((x) => [...x, { id: j.message.id, role: "assistant", content: j.message.content, cost: j.message.cost_usd, tools: j.message.meta?.tools }]);
    } catch {
      setError(fmt(errs.generic, { m: "" }));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <section className="card flex min-h-[70vh] min-w-0 flex-col">
      <div ref={box} className="max-h-[70vh] flex-1 space-y-5 overflow-y-auto p-5">
        {msgs.length === 0 ? (
          <div className="mx-auto max-w-2xl py-8 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Bot className="h-6 w-6" /></span>
            <h2 className="text-lg font-bold">{A.welcome}</h2>
            <p className="mt-2 text-sm text-muted">{A.welcomeHint}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {A.examples.map((q) => (
                <button key={q} type="button" disabled={disabled || busy} onClick={() => send(q)} className="chip h-auto rounded-xl px-3 py-2 text-left text-xs">{q}</button>
              ))}
            </div>
          </div>
        ) : null}
        {msgs.map((m, i) => (
          <div key={m.id ?? i} className={cx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-surface-3 text-muted" : "bg-accent-soft text-accent")}>
              {m.role === "user" ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </span>
            <div className={cx("min-w-0 max-w-[85%] rounded-2xl px-4 py-3", m.role === "user" ? "bg-accent text-accent-fg" : "border border-line bg-surface-2")}>
              {m.role === "user" ? <p className="whitespace-pre-wrap text-[15px]">{m.content}</p> : <Markdown text={m.content} />}
              {m.role === "assistant" && (m.tools?.length || m.cost) ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                  {m.tools?.length ? <span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" aria-hidden /> {[...new Set(m.tools)].join(", ")}</span> : null}
                  {m.cost ? <span className="num">≈ ${m.cost.toFixed(4)}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {busy ? <div className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> {A.thinking}</div> : null}
        {error ? <p role="alert" className="rounded-xl bg-loss-soft px-4 py-3 text-sm">{error}</p> : null}
      </div>
      <form className="flex items-end gap-2 border-t border-line p-4" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} disabled={disabled}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
          placeholder={A.placeholder} aria-label={A.placeholder} className="field min-h-[52px] flex-1 resize-none" />
        <button type="submit" className="btn btn-primary btn-icon h-[52px] w-[52px]" disabled={disabled || busy || !text.trim()} aria-label={A.send}>
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
      <p className="px-4 pb-3 text-[11px] text-faint">{A.disclaimer}</p>
    </section>
  );
}
