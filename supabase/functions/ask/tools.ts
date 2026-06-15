// supabase/functions/ask/tools.ts — Anthropic tool DEFINITIONS + EXECUTORS for
// the Ask assistant. Every tool is READ-ONLY and household-scoped: the executors
// query through the RLS-scoped Supabase client (the caller's JWT is forwarded),
// and additionally filter by the resolved household_id as belt-and-braces. The
// pure filtering/ranking/shaping logic lives in ./pure.js (unit-tested by the
// Node harness, tests/ask-tools.test.js); this file is only the thin DB wrapper.
//
// Data shapes (verified via information_schema 2026-06-15):
//   blob tables (select `data`): criteria, finances, goals, shortlist, profile,
//     journey_progress, area_confirmations, areas.
//   learned_preferences: columns derived/overrides/dismissals (jsonb).
//   household_areas: (household_id, area_id, added_via, status).
//   readiness_checklist / investments_*: relational columns.
//   listings: GLOBAL public-read table (no household_id) — never household-filtered.
//   listing_reactions: append-only (reaction in like/pass/reject + reasons).

import {
  rankAndFilterListings, buildListingsQuery, searchAreasPure, shapeFinancesSummary, renderOutreachDraft,
} from "./pure.js";

// deno-lint-ignore no-explicit-any
type SB = any;
export interface ToolCtx { supabase: SB; householdId: string; templatesUrl: string; }

// ── Tool definitions (JSON schemas sent to Anthropic) ─────────────────────────
export const TOOLS = [
  {
    name: "get_finances_detail",
    description:
      "Get the household's full finances record plus a derived summary (deposit target, deposit saved, " +
      "deposit gap, monthly contribution, naive months-to-target, income, mortgage estimate). Use for " +
      "any question about affordability, deposit, savings, income, or budget headroom.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_budget_breakdown",
    description:
      "Get the household's monthly money-flow inputs: ongoing bills, recurring expenses and one-time " +
      "costs from the finances record. Use for 'where does my money go' / monthly outgoings questions.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "query_listings",
    description:
      "Filter the live listings feed and return ranked summaries WITH fit verdicts (strong/possible/" +
      "stretch/weak) and reason chips. Use for anything about what is currently for sale. Never returns " +
      "the whole table — always a small ranked slice.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        maxPrice: { type: "number", description: "max asking price (£)" },
        minPrice: { type: "number", description: "min asking price (£)" },
        minBeds: { type: "number", description: "minimum bedrooms" },
        area: { type: "string", description: "village/town/postcode/area-id substring" },
        propertyType: { type: "string", description: "e.g. detached, cottage, bungalow" },
        keyword: { type: "string", description: "free text matched in title/description/address" },
        limit: { type: "number", description: "max rows to return (default 10, capped at 25)" },
      },
    },
  },
  {
    name: "get_listing",
    description: "Get one listing's full dossier by its Rightmove id.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { rightmove_id: { type: "string" } },
      required: ["rightmove_id"],
    },
  },
  {
    name: "get_saved_properties",
    description:
      "Get the household's shortlist: saved listing ids with personal status " +
      "(new/saved/viewed/offered/rejected) and any 1–10 ratings.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_reactions_summary",
    description:
      "Get a distilled summary of the household's like/pass/reject reactions plus their learned " +
      "preference weights (what they tend to favour or avoid). Use for 'what do I tend to like' questions.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_areas",
    description:
      "Search the researched area catalogue (village profiles: overview, town, county, status) by free " +
      "text and/or county/town. Use for questions about candidate areas/villages.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        county: { type: "string" },
        town: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_area",
    description: "Get one area's full researched record by its area id (e.g. 'winchester-so23').",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { area_id: { type: "string" } },
      required: ["area_id"],
    },
  },
  {
    name: "get_household_areas",
    description: "Get the household's selected/confirmed search areas (their actual search zone).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_trends",
    description:
      "Get savings/investment trend series: investment monthly history (deposits/withdrawals/net) and " +
      "the savings position. Use for 'how is X trending' questions.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_journey_status",
    description: "Get the buying-journey progress (done/next) and the readiness checklist.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_outreach_templates",
    description:
      "List the outreach message templates (id, recipient role, stage, title, data needed). Use before " +
      "drafting an outreach message to pick the right template.",
    input_schema: {
      type: "object",
      properties: { recipientRole: { type: "string", description: "optional filter, e.g. estate-agent" } },
    },
  },
  {
    name: "draft_outreach",
    description:
      "Draft an outreach message from a template id, filling {{placeholders}} from the household's " +
      "profile/finances and any listing/contact context you pass. Returns subject + body TEXT only — it " +
      "never sends anything. Reports any placeholders it could not fill.",
    input_schema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        listing: { type: "object", description: "ad-hoc listing context, e.g. { address, askingPrice, ref, portal }" },
        contact: { type: "object", description: "ad-hoc contact context, e.g. { agentName }" },
        extra: { type: "object", description: "any other {{placeholder}} values, e.g. { viewingDateOption1 }" },
      },
      required: ["templateId"],
    },
  },
];

// ── DB helpers ────────────────────────────────────────────────────────────────
async function getBlob(ctx: ToolCtx, table: string): Promise<unknown> {
  const { data, error } = await ctx.supabase
    .from(table).select("data").eq("household_id", ctx.householdId).limit(1);
  if (error) throw error;
  return data?.[0]?.data ?? null;
}

let _templatesCache: unknown[] | null = null;
async function getTemplates(ctx: ToolCtx): Promise<any[]> {
  if (_templatesCache) return _templatesCache as any[];
  const res = await fetch(ctx.templatesUrl);
  if (!res.ok) throw new Error(`could not load outreach templates (${res.status})`);
  _templatesCache = await res.json();
  return _templatesCache as any[];
}

// ── Executor dispatch ──────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
export async function runTool(name: string, input: any, ctx: ToolCtx): Promise<unknown> {
  const inp = input ?? {};
  try {
    switch (name) {
      case "get_finances_detail": {
        const raw = await getBlob(ctx, "finances");
        if (!raw) return { error: "no finances on record" };
        return { summary: shapeFinancesSummary(raw), finances: raw };
      }
      case "get_budget_breakdown": {
        const f = (await getBlob(ctx, "finances")) as any;
        if (!f) return { error: "no finances on record" };
        return {
          ongoingBills: f.ongoingBills ?? [],
          expenses: f.expenses ?? [],
          oneTimeCosts: f.oneTimeCosts ?? [],
          income: f.income ?? null,
          mortgage: f.mortgage ?? null,
        };
      }
      case "query_listings": {
        // Push the cheap/indexed predicates down to Postgres and fetch a bounded
        // candidate window; pure.js still does the ranking/dedup/gating (P1-1).
        const plan = buildListingsQuery(inp);
        let q = ctx.supabase.from("listings").select(plan.columns);
        for (const fl of plan.filters) {
          if (fl.kind === "eq") q = q.eq(fl.col, fl.value);
          else if (fl.kind === "or") q = q.or(fl.expr);
        }
        q = q.order(plan.order.col, { ascending: plan.order.ascending }).limit(plan.limit);
        const [criteria, res] = await Promise.all([getBlob(ctx, "criteria"), q]);
        if (res.error) throw res.error;
        return rankAndFilterListings(res.data ?? [], inp, criteria ?? {});
      }
      case "get_listing": {
        if (!inp.rightmove_id) return { error: "rightmove_id is required" };
        // Select only the fields an answer needs — never raw_json / price_history's
        // siblings — so we don't ship the whole source payload back as input tokens (P2-1).
        const { data } = await ctx.supabase
          .from("listings").select(
            "rightmove_id, url, title, address, postcode, outcode, area_id, price, beds, baths, " +
            "property_type, tenure, epc, council_tax, status, description, added_date, price_history",
          ).eq("rightmove_id", String(inp.rightmove_id)).limit(1);
        return data?.[0] ?? { error: "listing not found" };
      }
      case "get_saved_properties": {
        const sl = await getBlob(ctx, "shortlist");
        return sl ?? { ids: [], status: {}, ratings: {} };
      }
      case "get_reactions_summary": {
        // One grouped read (RPC) for the like/pass/reject counts instead of three
        // sequential head counts (P2-2); learned prefs in parallel.
        const [{ data: rows }, { data: lp }] = await Promise.all([
          ctx.supabase.rpc("ask_reaction_counts", { hh: ctx.householdId }),
          ctx.supabase
            .from("learned_preferences")
            .select("derived, overrides").eq("household_id", ctx.householdId).limit(1),
        ]);
        const counts: Record<string, number> = { like: 0, pass: 0, reject: 0 };
        for (const r of (rows ?? []) as { reaction: string; n: number }[]) {
          counts[r.reaction] = Number(r.n) || 0;
        }
        return { counts, learned: lp?.[0]?.derived ?? null, overrides: lp?.[0]?.overrides ?? null };
      }
      case "search_areas": {
        // Cap the pull; areas is ~200 rows so one select is fine.
        const { data } = await ctx.supabase.from("areas").select("id, data").limit(400);
        return searchAreasPure(data ?? [], inp);
      }
      case "get_area": {
        if (!inp.area_id) return { error: "area_id is required" };
        const { data } = await ctx.supabase
          .from("areas").select("id, data").eq("id", String(inp.area_id)).limit(1);
        if (!data?.[0]) return { error: "area not found" };
        return { id: data[0].id, ...(data[0].data ?? {}) };
      }
      case "get_household_areas": {
        const { data } = await ctx.supabase
          .from("household_areas").select("area_id, added_via, status")
          .eq("household_id", ctx.householdId);
        return { areas: data ?? [] };
      }
      case "get_trends": {
        const [{ data: hist }, f] = await Promise.all([
          ctx.supabase.from("investments_history")
            .select("month, deposits, withdrawals, net, dividends, interest")
            .eq("household_id", ctx.householdId).order("month", { ascending: true }),
          getBlob(ctx, "finances"),
        ]);
        return {
          investmentsHistory: hist ?? [],
          savings: (f as any)?.savings ?? null,
        };
      }
      case "get_journey_status": {
        const [progress, { data: readiness }] = await Promise.all([
          getBlob(ctx, "journey_progress"),
          ctx.supabase.from("readiness_checklist")
            .select("item_key, item_label, completed").eq("household_id", ctx.householdId),
        ]);
        return { progress: progress ?? null, readiness: readiness ?? [] };
      }
      case "get_outreach_templates": {
        const templates = await getTemplates(ctx);
        const filtered = inp.recipientRole
          ? templates.filter((t) => t.recipientRole === inp.recipientRole)
          : templates;
        return filtered.map((t) => ({
          id: t.id, stage: t.stage, recipientRole: t.recipientRole,
          title: t.title, description: t.description, dataNeeded: t.dataNeeded,
        }));
      }
      case "draft_outreach": {
        if (!inp.templateId) return { error: "templateId is required" };
        const templates = await getTemplates(ctx);
        const template = templates.find((t) => t.id === inp.templateId);
        if (!template) return { error: `unknown templateId: ${inp.templateId}` };
        const [profile, finances] = await Promise.all([
          getBlob(ctx, "profile"), getBlob(ctx, "finances"),
        ]);
        const context = {
          profile: profile ?? {},
          finances: finances ?? {},
          listing: inp.listing ?? {},
          contact: inp.contact ?? {},
          ...(inp.extra ?? {}),
        };
        return renderOutreachDraft(template, context);
      }
      default:
        return { error: `unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: `tool ${name} failed: ${(e as Error).message}` };
  }
}
