#!/usr/bin/env node
// refinement-run.mjs — Stage 3 scheduled job driver for the Model Refinement Engine
// (docs/archive/REFINEMENT_PLAN.md §3). Snapshots reactions → runs the pure engine → plans the
// persistence writes → applies them. Two apply paths:
//   • `--apply` (CI default since 2026-07-05): writes the plan through PostgREST with the
//     service-role key — the same secrets the other scheduled jobs use; no psql/DB URL.
//   • SQL emit (default/`--emit-sql`): prints the idempotent SQL for a dry run or for
//     Claude to apply via the Supabase MCP connector in the sandbox.
// NOTIFY-ONLY — the plan touches only refinement_suggestions /
// refinement_runs / sync_log, plus the scrape_probation STATUS HINT (step 4.6b:
// active ↔ reconsider — both statuses keep the area paused, so scrape scope never
// changes here; only the user's bring-back does that). Never listings / criteria /
// zones.
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
//     existingSuggestions?:[...], dismissedKeys?:["dim:value", ...],
//     probationRows?:[...],                      // scrape_probation rows (reconsider detection)
//     learnedDerived?:{...} }                    // learned_preferences.derived (weights snapshot)

import { readFile, writeFile } from 'node:fs/promises';
import { runRefinementEngine, scoreFromAggregates } from '../assets/js/refinement/engine.js';
import { resolveConfig, DIMENSIONS } from '../assets/js/refinement/config.js';
import {
  priorRunsFromRows, planRun, renderPlanSql, renderProbationSql,
  restSuggestionsUpsert, restRunInsert, restSyncLogInsert, restProbationPatches,
} from '../assets/js/refinement/persistence.js';
import { reconsiderUpdates } from '../assets/js/refinement/scope.js';
import { effectiveWeights } from '../assets/js/learned-preferences.js';
import { genuineReactions } from '../assets/js/listings/reaction-provenance.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
      probationRows: bundle.probationRows || [],
      learnedDerived: bundle.learnedDerived || null,
    };
  }
  if (!SERVICE_KEY) throw new Error('no service key — use --from-file <bundle.json> (build via MCP) for the sandbox path');
  const householdId = arg('--household') || (await restGetAll('households?select=id'))[0]?.id;
  // Scope reactions to THIS household — the engine baseline/lift must reflect one
  // household's taste, never a cross-household blend (the service role bypasses RLS).
  const reactions = await restGetAll(`listing_reactions?select=listing_id,reaction,reason,reasons,created_at,listing_snapshot&household_id=eq.${householdId}`);
  const existingSuggestions = await restGetAll(`refinement_suggestions?select=dimension,value,status,runs_qualified,first_detected_at,snoozed_until&household_id=eq.${householdId}`);
  // Paused areas, so the run can flip the reconsider status hint (step 4.6b).
  const probationRows = await restGetAll(`scrape_probation?select=dimension,value,status,approved_at&household_id=eq.${householdId}`);
  // Stage 7: the household's chosen sensitivity preset + dismiss memory live in
  // learned_preferences (reserved overrides key + dismissals). Read them so a portal
  // preset change / dismissal takes effect on this run.
  const lp = (await restGetAll(`learned_preferences?select=overrides,dismissals,derived&household_id=eq.${householdId}`))[0] || {};
  // No stored preset → resolveConfig falls back to DEFAULT_PRESET (balanced, 2026-07-05).
  const preset = lp.overrides?.__refinement_settings?.preset;
  const dismissedKeys = new Set(Object.keys(lp.dismissals || {}).filter((k) => k.includes(':')));
  return {
    householdId, now: new Date().toISOString(), config: resolveConfig({ preset }),
    aggregates: null, reactions, existingSuggestions, dismissedKeys, probationRows,
    learnedDerived: lp.derived || null,
  };
}

async function main() {
  const { householdId, now, config, aggregates, reactions, existingSuggestions, dismissedKeys, probationRows, learnedDerived } = await loadInputs();
  if (!householdId) throw new Error('no householdId resolved');

  const priorRunsQualified = priorRunsFromRows(existingSuggestions);
  // Refinement findings must reflect GENUINE, one-at-a-time reactions — not the en-masse
  // area/price sweeps + administrative removals that dominate the log (they inflate the
  // baseline to ~99%, so every value — INCLUDING the user's favourite types — looks
  // "disproportionately rejected"). In reactions-mode we drop bulk + admin here; an
  // aggregates-mode caller must pre-filter the SAME way in SQL (docs/REFINEMENT_README.md).
  // `--all-reactions` bypasses the filter (debugging / parity checks).
  const useAll = process.argv.includes('--all-reactions');
  const filtered = (reactions && !useAll) ? genuineReactions(reactions) : reactions;
  if (reactions && !useAll) {
    process.stderr.write(`  genuine-only filter: ${reactions.length} → ${filtered.length} reactions (dropped ${reactions.length - filtered.length} bulk/admin)\n`);
  }
  const run = aggregates
    ? scoreFromAggregates(aggregates, { config, now, dimensions: DIMENSIONS, priorRunsQualified })
    : runRefinementEngine(filtered || [], { config, now, dimensions: DIMENSIONS, priorRunsQualified });

  // weights_snapshot (P10i, step 4.8): flatten the live learned weights to a
  // signal→weight map for the run-row audit trail. effectiveWeights with empty
  // overrides = the derived layer only, and it drops reserved/non-numeric entries.
  const weightsSnapshot = learnedDerived ? effectiveWeights(learnedDerived, {}) : null;

  const plan = planRun(run, { householdId, existingRows: existingSuggestions, dismissedKeys, now, weightsSnapshot });

  // Reconsider detection (step 4.6b): the same GENUINE reactions decide whether a
  // paused area's status hint should flip. Aggregates-mode bundles carry no raw
  // reactions, so there is no evidence to judge — hold every hint as-is.
  const probation = probationRows || [];
  const probationFlips = filtered ? reconsiderUpdates(probation, filtered, config) : [];
  if (!filtered && probation.length) {
    process.stderr.write('  reconsider check skipped: aggregates-mode bundle has no raw reactions\n');
  }
  const probationSql = renderProbationSql(probationFlips, { householdId, now });

  const sql = renderPlanSql(plan) + (probationSql ? `\n\n${probationSql}` : '');

  // Human-readable summary (stderr so stdout can be piped as pure SQL).
  const top = run.candidates.slice(0, 8).map((c) =>
    `    ${c.dimension}/${c.value}  wilson=${c.wilson_lower.toFixed(3)} lift=${c.lift.toFixed(2)} `
    + `n_eff=${c.n_eff.toFixed(1)} tier=${c.tier}${c.volume_artefact ? ' [artefact]' : ''}`
    + `${c.actionable ? ' ★ACTIONABLE' : ''}`);
  const flips = probationFlips.map((f) =>
    `    ${f.value}: ${f.from} → ${f.to}  (post-pause reject rate ${(f.rate * 100).toFixed(0)}% over ${f.n} reactions)`);
  process.stderr.write(
    `\n  Refinement run (household ${householdId})\n`
    + `  preset=${config.preset}  evaluated=${run.candidates.length}  tracked=${plan.trackedCount}  actionable=${plan.actionableCount}\n`
    + `  baseline reject rate: area=${(run.baseline.area ?? 0).toFixed(3)} property_type=${(run.baseline.property_type ?? 0).toFixed(3)}\n`
    + `  top candidates:\n${top.join('\n')}\n`
    + `  probation reconsider flips: ${probationFlips.length}${flips.length ? `\n${flips.join('\n')}` : ''}\n\n`);

  // ── APPLY VIA POSTGREST (2026-07-05, owner-directed) ─────────────────────────
  // `--apply` writes the plan itself through PostgREST with the service-role key —
  // the same two secrets every other scheduled job already uses. No psql, no
  // SUPABASE_DB_URL. The SQL emit paths below remain for dry runs / the MCP sandbox.
  if (process.argv.includes('--apply')) {
    if (!SERVICE_KEY) throw new Error('--apply needs SUPABASE_SERVICE_ROLE_KEY');
    const restWrite = async ({ method, path, headers = {}, body }) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`PostgREST ${method} ${path} → ${res.status}: ${await res.text()}`);
      return res;
    };
    const upsert = restSuggestionsUpsert(plan);
    if (upsert) await restWrite(upsert);
    const runRes = await restWrite(restRunInsert(plan));
    const runId = (await runRes.json())[0]?.id ?? null;
    if (runId != null) await restWrite(restSyncLogInsert(runId, plan));
    for (const patch of restProbationPatches(probationFlips, { householdId, now })) {
      await restWrite(patch);
    }
    process.stderr.write(`  applied via PostgREST: ${plan.upserts.length} suggestion upserts + run row ${runId ?? '(id unknown)'} + sync_log + ${probationFlips.length} probation flips\n`);
    return;
  }

  const emit = arg('--emit-sql');
  if (emit) {
    await writeFile(emit, `${sql}\n`, 'utf8');
    process.stderr.write(`  SQL plan → ${emit}  (${plan.upserts.length} upserts + 1 run row + 1 sync_log + ${probationFlips.length} probation flips)\n`);
  } else {
    process.stdout.write(`${sql}\n`);
  }
}

main().catch((e) => { process.stderr.write(`refinement-run failed: ${e.message}\n`); process.exit(1); });
