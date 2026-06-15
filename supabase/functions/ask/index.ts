// supabase/functions/ask/index.ts — the Ask Edge Function.
//
// Flow (Ask plan §1): verify the user's Supabase JWT → resolve their household
// (RLS-scoped) → build a prompt-cached system prompt → call Anthropic with
// read-only tools and STREAM the answer back over SSE, running the tool loop
// (≤ MAX_TOOL_LOOPS) without ever closing the stream on a mid-answer tool_use.
// The Anthropic key lives only as a Supabase secret (ANTHROPIC_API_KEY); it is
// never sent to the browser. The function is stateless — the browser owns
// conversation persistence (storage/ask.js).

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS } from "../_shared/cors.ts";
import { TOOLS, runTool, type ToolCtx } from "./tools.ts";
import { buildSystemPrompt } from "./prompt.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const ALLOWED_MODELS = new Set(["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-8"]);
const MAX_TOOL_LOOPS = 6;
const MAX_TOKENS = 1500;
const MAX_HISTORY_TURNS = 24;        // cap conversation length sent upstream
const MAX_TURN_CHARS = 16_000;       // per-turn hard char cap (abuse guard)

// Outreach templates are public static JSON on the deployed site.
const TEMPLATES_URL = Deno.env.get("OUTREACH_TEMPLATES_URL") ??
  "https://georgianrectory.com/data/outreach-templates.json";

Deno.serve(async (req) => {
  const cors = CORS(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }
  if (!ANTHROPIC_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500, cors);
  }

  // 1) Auth — RLS-scoped client that forwards the caller's JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401, cors);

  // 2) Resolve household (RLS lets the user see only their own membership row).
  const { data: hm } = await supabase
    .from("household_members").select("household_id").eq("user_id", user.id).limit(1);
  const householdId = hm?.[0]?.household_id;
  if (!householdId) return json({ error: "No household" }, 403, cors);

  // 3) Parse + sanitise the request.
  let body: { messages?: unknown; model?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400, cors); }

  const messages = sanitiseMessages(body.messages);
  if (!messages.length) return json({ error: "messages must be a non-empty array of user/assistant turns" }, 400, cors);

  const model = typeof body.model === "string" && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
  const system = await buildSystemPrompt(supabase, householdId);
  const ctx: ToolCtx = { supabase, householdId, templatesUrl: TEMPLATES_URL };

  // 4) Stream the answer, running the tool loop.
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      // deno-lint-ignore no-explicit-any
      const convo: any[] = [...messages];
      const usageTotals = { input: 0, output: 0 };

      try {
        for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": ANTHROPIC_KEY,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({ model, max_tokens: MAX_TOKENS, stream: true, system, tools: TOOLS, messages: convo }),
          });

          if (!res.ok || !res.body) {
            const detail = await safeText(res);
            send({ type: "error", message: `Anthropic API error (${res.status})`, detail });
            break;
          }

          const { assistantBlocks, stopReason, usage } = await relayAnthropicSSE(res, send);
          usageTotals.input += usage.input;
          usageTotals.output += usage.output;

          if (stopReason !== "tool_use") {
            send({ type: "done", usage: usageTotals });
            break;
          }

          // Run the requested tools, append the assistant turn + a tool_result turn, loop.
          // Drop any empty text block (Anthropic rejects empty text content blocks)
          // while keeping the tool_use blocks the loop depends on.
          const assistantTurn = assistantBlocks.filter(
            (b) => !(b.type === "text" && !String(b.text ?? "").trim()),
          );
          convo.push({ role: "assistant", content: assistantTurn });
          // deno-lint-ignore no-explicit-any
          const toolResults: any[] = [];
          for (const b of assistantBlocks.filter((x) => x.type === "tool_use")) {
            send({ type: "tool", name: b.name });
            const result = await runTool(b.name, b.input, ctx);
            toolResults.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result) });
          }
          convo.push({ role: "user", content: toolResults });

          if (i === MAX_TOOL_LOOPS - 1) {
            // Exhausted the loop budget without a final answer.
            send({ type: "error", message: "Reached the tool-call limit before finishing. Try a more specific question." });
          }
        }
      } catch (e) {
        send({ type: "error", message: String((e as Error)?.message ?? e) });
      } finally {
        controller.close();
        // Post-response usage logging must not delay the close.
        try {
          // @ts-ignore EdgeRuntime is provided by the Supabase runtime.
          EdgeRuntime?.waitUntil?.(Promise.resolve(
            console.log(`ask usage household=${householdId} model=${model} in=${usageTotals.input} out=${usageTotals.output}`),
          ));
        } catch { /* logging is best-effort */ }
      }
    },
  });

  return new Response(stream, {
    headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
});

// ── Anthropic SSE relay ─────────────────────────────────────────────────────────
// Parses Anthropic's streamed /v1/messages response: forwards text deltas to the
// client as {type:'text'} events, accumulates the assistant content blocks (text +
// tool_use with their streamed input_json), and captures stop_reason + token usage.
// deno-lint-ignore no-explicit-any
async function relayAnthropicSSE(res: Response, send: (o: unknown) => void): Promise<{ assistantBlocks: any[]; stopReason: string; usage: { input: number; output: number } }> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  // deno-lint-ignore no-explicit-any
  const blocks: any[] = [];           // by content index
  const partials: string[] = [];      // accumulating tool_use input json, by index
  let stopReason = "end_turn";
  const usage = { input: 0, output: 0 };

  const handle = (evt: any) => {
    switch (evt?.type) {
      case "message_start":
        usage.input += evt.message?.usage?.input_tokens ?? 0;
        break;
      case "content_block_start": {
        const cb = evt.content_block ?? {};
        blocks[evt.index] = cb.type === "tool_use"
          ? { type: "tool_use", id: cb.id, name: cb.name, input: {} }
          : { type: "text", text: "" };
        partials[evt.index] = "";
        break;
      }
      case "content_block_delta": {
        const d = evt.delta ?? {};
        if (d.type === "text_delta") {
          blocks[evt.index].text += d.text;
          send({ type: "text", text: d.text });
        } else if (d.type === "input_json_delta") {
          partials[evt.index] += d.partial_json ?? "";
        }
        break;
      }
      case "content_block_stop": {
        const b = blocks[evt.index];
        if (b?.type === "tool_use") {
          try { b.input = partials[evt.index] ? JSON.parse(partials[evt.index]) : {}; }
          catch { b.input = {}; }
        }
        break;
      }
      case "message_delta":
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
        usage.output += evt.usage?.output_tokens ?? 0;
        break;
      case "error":
        send({ type: "error", message: evt.error?.message ?? "stream error" });
        break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try { handle(JSON.parse(payload)); } catch { /* skip malformed line */ }
    }
  }

  return { assistantBlocks: blocks.filter(Boolean), stopReason, usage };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function sanitiseMessages(raw: unknown): { role: string; content: string }[] {
  if (!Array.isArray(raw)) return [];
  const out = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role as string, content: String(m.content).slice(0, MAX_TURN_CHARS) }))
    .filter((m) => m.content.trim().length > 0);
  // Keep only the most recent turns, and ensure the thread starts with a user turn.
  const tail = out.slice(-MAX_HISTORY_TURNS);
  while (tail.length && tail[0].role !== "user") tail.shift();
  return tail;
}

function json(obj: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 500); } catch { return ""; }
}
