import "server-only";
/**
 * Minimal OpenAI Responses API client (server-only). The key is read from OPENAI_API_KEY and is
 * never sent to the browser. store:false keeps conversations out of OpenAI's stored responses.
 */
import { estimateCost } from "./models";
import { runTool, TOOL_DEFS, type ToolOutput } from "./tools";

type Ctx = Parameters<typeof runTool>[2];
type InputItem = Record<string, unknown>;

export function openAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

interface Usage { input: number; cached: number; output: number }

async function call(body: Record<string, unknown>): Promise<{ output: InputItem[]; usage: Usage }> {
  const send = (b: Record<string, unknown>) => fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}` },
    body: JSON.stringify(b),
    signal: AbortSignal.timeout(120_000),
  });
  let res = await send(body);
  if (res.status === 400 && body.reasoning) {
    const txt = await res.clone().text();
    if (/reasoning|include/i.test(txt)) {
      const { reasoning: _r, include: _i, ...rest } = body; void _r; void _i;
      res = await send(rest);
    }
  }
  if (!res.ok) {
    let msg = `OpenAI error ${res.status}`;
    try { const j = await res.json(); if (j?.error?.message) msg += `: ${j.error.message}`; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const j = await res.json();
  const u = j.usage ?? {};
  return {
    output: Array.isArray(j.output) ? j.output : [],
    usage: { input: Number(u.input_tokens) || 0, cached: Number(u.input_tokens_details?.cached_tokens) || 0, output: Number(u.output_tokens) || 0 },
  };
}

export interface AssistantResult { text: string; usage: Usage; cost: number; tools: string[] }

const MAX_STEPS = 6;

export async function runAssistant(opts: {
  model: string; instructions: string; history: { role: "user" | "assistant"; content: string }[]; ctx: Ctx;
}): Promise<AssistantResult> {
  const input: InputItem[] = opts.history.map((m) => ({ role: m.role, content: m.content }));
  const usage: Usage = { input: 0, cached: 0, output: 0 };
  const tools: string[] = [];
  for (let step = 0; step <= MAX_STEPS; step++) {
    const last = step === MAX_STEPS;
    const r = await call({
      model: opts.model, instructions: opts.instructions, input, tools: TOOL_DEFS,
      tool_choice: last ? "none" : "auto", store: false, include: ["reasoning.encrypted_content"], reasoning: { effort: "low" },
    });
    usage.input += r.usage.input; usage.cached += r.usage.cached; usage.output += r.usage.output;
    const calls = r.output.filter((o) => o.type === "function_call");
    if (!calls.length || last) {
      const text = r.output.filter((o) => o.type === "message")
        .flatMap((o) => (Array.isArray(o.content) ? o.content : []))
        .filter((c: { type?: string }) => c.type === "output_text").map((c: { text?: string }) => c.text ?? "").join("\n").trim();
      return { text, usage, cost: estimateCost(opts.model, usage.input, usage.cached, usage.output), tools };
    }
    input.push(...r.output);
    for (const c of calls) {
      const name = String(c.name);
      tools.push(name);
      let output: ToolOutput;
      try { output = await runTool(name, String(c.arguments ?? "{}"), opts.ctx); }
      catch (e) { output = JSON.stringify({ error: e instanceof Error ? e.message : "Tool failed" }); }
      input.push({ type: "function_call_output", call_id: c.call_id, output });
    }
  }
  throw new Error("unreachable");
}

export function systemPrompt(o: { locale: "en" | "ka"; today: string; tz: string; currency: string }): string {
  return [
    "You are the analysis assistant inside TRADING HQ, a private futures trading journal. You answer questions about THIS user's own trading data.",
    `Today is ${o.today} (${o.tz}). Money is in ${o.currency}. Reply in ${o.locale === "ka" ? "Georgian (ქართული)" : "English"}.`,
    "ACCURACY RULES — follow strictly:",
    "1. Every number must come from a tool result in this conversation. Never invent trades, statistics, dates, prices or screenshots. If you have not fetched it, call a tool.",
    "2. Always state the sample size (n) behind a statistic. If n < 10 say the data is insufficient for a conclusion; if n < 30 call it preliminary.",
    "3. Label clearly what is a FACT (recorded data), a CALCULATION (derived by the tools), an INTERPRETATION (your reading), and a RECOMMENDATION. Use short labels such as **Fact:**, **Calculation:**, **Interpretation:**, **Recommendation:**.",
    "4. If the data needed is missing or unrecorded, say so plainly ('insufficient data' / 'not recorded'). Unrecorded flags are not 'no'.",
    "5. Correlation is not causation. Do not promise future results. You are not a licensed financial adviser; do not give personalised investment advice — focus on the user's own process, rules and execution.",
    "6. When you refer to specific trades, link them as markdown links [YYYY-MM-DD SYMBOL](/journal/<trade id>) using ids from tool results.",
    "7. Sample data (is_sample) is excluded unless the user asks for it.",
    "8. Be concise: short paragraphs, bullet lists or small markdown tables.",
  ].join("\n");
}
