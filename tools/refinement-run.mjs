#!/usr/bin/env node
// refinement-run.mjs — Stage 3 scheduled job driver for the Model Refinement Engine
// (docs/REFINEMENT_PLAN.md §3). Snapshots reactions → runs the pure engine → plans the
// persistence writes → EMITS idempotent SQL. It never executes DDL/DML itself: the
// caller runs the emitted SQL (Claude via the Supabase MCP connector in this sandbox;
// CI via `psql`). NOTIFY-ONLY — the plan touches only refinement_suggestions /
// refinement_runs / sync_log, never listings / criteria / zones / scrape scope.
//
// TWO READ MODES (mirrors tools/backfill-geofence.mjs):
//   File mode (this sandbox; bundle produced via MCP execute_sql):
//     node tools/refinement-run.mjs --from-file /tmp/refine-bundle.json --emit-sql /tmp/refine.sql
//   REST mode (CI / a machine with the service-role key):
//     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → reads reactions + suggestions via
//     PostgREST, emits SQL to stdout (pipe into psql to apply).
//
// Bundle shape (file mode):
//   { householdId, now?, config?:{preset?,overrides?},
//     aggregates?:{systemDecayed,perDimension}  // preferred: decayed counts from SQL
//     reactions?:[...]                           // OR raw rows (aggregated in JS)
//     existingSuggestions?:[...], dismissedKeys?:["dim:value", ...] }

import { readFile, writeFile } from 'node:fs/promises';
import { runRefinementEngine, scoreFromAggregates } from '../assets/js/refinement/engine.js';
import { resolveConfig } from '../assets/js/refinement/config.js';
import { priorRunsFromRows, planRun, renderPlanSql } from '../assets/js/refinement/persistence.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DIMENSIONS = ['area', 'property_type'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function restGetAll(path) {
  const out = [];
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}&limit=1000&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function loadInputs() {
  const fromFile = arg('--from-file');
  if (fromFile) {
    const bundle = JSON.parse(await readFile(fromFile, 'utf8'));
    return {
      householdId: bundle.householdId,
      now: bundle.now || new Date().toISOString(),
      config: resolveConfig(bundle.config || {}),
      aggregates: bundle.aggregates || null,
      reactions: bundle.reactions || null,
      existingSuggestions: bundle.existingSuggestions || [],
      dismissedKeys: new Set(bundle.dismissedKeys || []),
    };
  }
  if (!SERVICE_KEY) throw new Error('no service key — use --from-file <bundle.json> (build via MCP) for the sandbox path');
  const householdId = arg('--household') || (await restGetAll('households?select=id'))[0]?.id;
  const reactions = await restGetAll('listing_reactions?select=listing_id,reaction,created_at,listing_snapshot');
  const existingSuggestions = await restGetAll(`refinement_suggestions?select=dimension,value,status,runs_qualified,first_detected_at,snoozed_until&household_id=eq.${householdId}`);
  // Stage 7: the household's chosen sensitivity preset + dismiss memory live in
  // learned_preferences (reserved overrides key + dismissals). Read them so a portal
  // preset change / dismissal takes effect on this run.
  const lp = (await restGetAll(`learned_preferences?select=overrides,dismissals&household_id=eq.${householdId}`))[0] || {};
  const preset = lp.overrides?.__refinement_settings?.preset || 'cautious';
  const dismissedKeys = new Set(Object.keys(lp.dismissals || {}).filter((k) => k.includes(':')));
  return {
    householdId, now: new Date().toISOString(), config: resolveConfig({ preset }),
    aggregates: null, reactions, existingSuggestions, dismissedKeys,
  };
}

async function main() {
  const { householdId, now, config, aggregates, reactions, existingSuggestions, dismissedKeys } = await loadInputs();
  if (!householdId) throw new Error('no householdId resolved');

  const priorRunsQualified = priorRunsFromRows(existingSuggestions);
  const run = aggregates
    ? scoreFromAggregates(aggregates, { config, now, dimensions: DIMENSIONS, priorRunsQualified })
    : runRefinementEngine(reactions || [], { config, now, dimensions: DIMENSIONS, priorRunsQualified });

  const plan = planRun(run, { householdId, existingRows: existingSuggestions, dismissedKeys, now });
  const sql = renderPlanSql(plan);

  // Human-readable summary (stderr so stdout can be piped as pure SQL).
  const top = run.candidates.slice(0, 8).map((c) =>
    `    ${c.dimension}/${c.value}  wilson=${c.wilson_lower.toFixed(3)} lift=${c.lift.toFixed(2)} `
    + `n_eff=${c.n_eff.toFixed(1)} tier=${c.tier}${c.volume_artefact ? ' [artefact]' : ''}`
    + `${c.actionable ? ' ★ACTIONABLE' : ''}`);
  process.stderr.write(
    `\n  Refinement run (household ${householdId})\n`
    + `  preset=${config.preset}  evaluated=${run.candidates.length}  tracked=${plan.trackedCount}  actionable=${plan.actionableCount}\n`
    + `  baseline reject rate: area=${(run.baseline.area ?? 0).toFixed(3)} property_type=${(run.baseline.property_type ?? 0).toFixed(3)}\n`
    + `  top candidates:\n${top.join('\n')}\n\n`);

  const emit = arg('--emit-sql');
  if (emit) {
    await writeFile(emit, `${sql}\n`, 'utf8');
    process.stderr.write(`  SQL plan → ${emit}  (${plan.upserts.length} upserts + 1 run row + 1 sync_log)\n`);
  } else {
    process.stdout.write(`${sql}\n`);
  }
}

main().catch((e) => { process.stderr.write(`refinement-run failed: ${e.message}\n`); process.exit(1); });
