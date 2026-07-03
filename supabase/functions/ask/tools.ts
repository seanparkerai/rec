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
  rankAndFilterListings, buildListingsQuery, searchAreasPure, shapeFinancesSummary, assembleOutreachBrief,
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
    strict: true,
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "get_budget_breakdown",
    description:
      "Get the household's monthly money-flow inputs: ongoing bills, recurring expenses and one-time " +
      "costs from the finances record. Use for 'where does my money go' / monthly outgoings questions.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
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
      required: [],
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
    strict: true,
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "get_reactions_summary",
    description:
      "Get a distilled summary of the household's like/pass/reject reactions plus their learned " +
      "preference weights (what they tend to favour or avoid). Use for 'what do I tend to like' questions.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
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
      required: [],
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
    strict: true,
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "get_trends",
    description:
      "Get savings/investment trend series: investment monthly history (deposits/withdrawals/net) and " +
      "the savings position. Use for 'how is X trending' questions.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "get_journey_status",
    description: "Get the buying-journey progress (done/next) and the readiness checklist.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "get_outreach_templates",
    description:
      "List the outreach message templates as STYLE EXEMPLARS (id, recipient role, stage, title, " +
      "description, tone, best-practice notes, sources, data needed). Use to browse the catalogue or " +
      "ground your tone on the researched best practice — but author the email yourself, don't copy a " +
      "template verbatim. Prefer get_outreach_brief when you are about to write one.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        recipientRole: { type: "string", description: "optional filter, e.g. estate-agent" },
        stage: { type: "string", description: "optional stage filter: A (Search) | B (Offer) | C (Post-acceptance) | D (Pre-completion)" },
      },
      required: [],
    },
  },
  {
    name: "get_outreach_brief",
    description:
      "Assemble everything needed to WRITE an outreach email for a given recipient + situation: the " +
      "best-matching template as a style exemplar, its best-practice notes, the household facts you are " +
      "ALLOWED to use for this recipient (already privacy-filtered — an estate agent or vendor never sees " +
      "salary, savings, deposit total, credit or debts), the saved contact if any, the property facts if a " +
      "reference is given, and a list of missing facts to ask about. You then write the email yourself — do " +
      "not copy the exemplar verbatim, and never invent figures, names, dates or prices. Read-only: drafts " +
      "only, never sends or saves.",
    // DELIBERATELY NOT strict (the 7.1b exception, pinned by the tool-contract
    // rail): `extra` is a free-form object ({ offerAmount, viewingDateOption1,
    // surveyFindings, … } — whatever the user supplied), and strict schemas
    // cannot carry an open object (additionalProperties must be false on every
    // object, including nested ones). Closing it would silently drop user facts.
    input_schema: {
      type: "object",
      properties: {
        recipientRole: {
          type: "string",
          description: "estate-agent | mortgage-broker | solicitor | surveyor | vendor | removals | insurance | local-authority",
        },
        intent: { type: "string", description: "free-text situation, e.g. 'request a viewing', 'renegotiate after survey'" },
        templateId: { type: "string", description: "optional explicit template id (A1, B2, …) if the user picked one" },
        listingRef: { type: "string", description: "optional rightmove_id OR free-text address to ground property facts" },
        contactName: { type: "string", description: "optional recipient name to match against saved contacts" },
        extra: { type: "object", description: "any specifics the user gave: { offerAmount, viewingDateOption1, surveyFindings, … }" },
      },
      required: ["recipientRole"],
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

// Investments account, shaped as { trading212ISA } exactly like the browser's
// storage/user-state.js#getInvestments, so shapeFinancesSummary counts the
// deposit-earmarked ISA. The `data` jsonb already holds the trading212ISA fields;
// fall back to the relational columns if a row predates the jsonb blob.
// deno-lint-ignore no-explicit-any
async function getInvestments(ctx: ToolCtx): Promise<any> {
  try {
    const { data } = await ctx.supabase
      .from("investments_accounts")
      .select("data, current_value, earmark_pct, account_opened, account_type, provider")
      .eq("household_id", ctx.householdId).limit(1);
    const row = data?.[0];
    if (!row) return null;
    return {
      trading212ISA: row.data ?? {
        provider: row.provider,
        accountType: row.account_type,
        accountOpened: row.account_opened,
        earmarkPct: Number(row.earmark_pct) || 0,
        currentPortfolioValue: Number(row.current_value) || 0,
      },
    };
  } catch (_e) { return null; }
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
        const [raw, inv] = await Promise.all([getBlob(ctx, "finances"), getInvestments(ctx)]);
        if (!raw) return { error: "no finances on record" };
        // depositSaved = cash + earmarked ISA, matching the dashboard (computeDepositSavings).
        return { summary: shapeFinancesSummary(raw, inv), finances: raw, investments: inv };
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
        const filtered = templates.filter((t) =>
          (!inp.recipientRole || t.recipientRole === inp.recipientRole) &&
          (!inp.stage || t.stage === inp.stage));
        return filtered.map((t) => ({
          id: t.id, stage: t.stage, stageName: t.stageName, recipientRole: t.recipientRole,
          title: t.title, description: t.description, tone: t.tone,
          bestPracticeNotes: t.bestPracticeNotes ?? [], sources: t.sources ?? [],
          dataNeeded: t.dataNeeded,
        }));
      }
      case "get_outreach_brief": {
        if (!inp.recipientRole) return { error: "recipientRole is required" };
        const [templates, profile, finances, criteria, contacts, investments] = await Promise.all([
          getTemplates(ctx), getBlob(ctx, "profile"), getBlob(ctx, "finances"),
          getBlob(ctx, "criteria"), getBlob(ctx, "contacts"), getInvestments(ctx),
        ]);
        // Ground property facts only when the ref is a Rightmove id; a free-text
        // address is passed through to the model as the listingRef hint.
        let listing = null;
        if (inp.listingRef && /^\d+$/.test(String(inp.listingRef))) {
          const { data } = await ctx.supabase.from("listings")
            .select("rightmove_id, url, title, address, postcode, area_id, price, beds, baths, property_type, tenure, epc, council_tax, status")
            .eq("rightmove_id", String(inp.listingRef)).limit(1);
          listing = data?.[0] ?? null;
        }
        return assembleOutreachBrief({
          templates, recipientRole: inp.recipientRole, intent: inp.intent,
          templateId: inp.templateId, listingRef: inp.listingRef, listing,
          contactName: inp.contactName, extra: inp.extra ?? {},
          household: { profile, finances, criteria, contacts, investments },
        });
      }
      default:
        return { error: `unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: `tool ${name} failed: ${(e as Error).message}` };
  }
}
