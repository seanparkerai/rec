#!/usr/bin/env node
// radius-tune.mjs — scheduled driver for the per-area learned search radius
// (assets/js/refinement/radius.js). Snapshots the cross-household reaction log → runs the
// pure learner → plans the persistence writes → EMITS one idempotent SQL batch. It never
// executes DDL/DML itself: the caller runs the emitted SQL (Claude via the Supabase MCP
// connector in this sandbox; CI via psql). The plan touches ONLY area_search_tuning,
// refinement_suggestions (dimension='area_radius') and sync_log.
//
// Mirrors tools/refinement-run.mjs. Unlike refinement-run, the reaction read is
// CROSS-HOUSEHOLD: the applied radius is area-global (a union across households), and the
// per-household suggestions are split out by the learner from the same log.
//
// TWO READ MODES:
//   File mode (this sandbox; bundle produced via MCP execute_sql):
//     node tools/radius-tune.mjs --from-file /tmp/radius-bundle.json --emit-sql /tmp/r.sql
//   REST mode (CI / a machine with the service-role key):
//     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → reads reactions + tuning + suggestions
//     via PostgREST, emits SQL to stdout (pipe into psql to apply).
//
// Bundle shape (file mode):
//   { now?, config?:{preset?,overrides?},
//     reactions:[{ household_id, reaction, created_at, listing_snapshot }],
//     tuningRows?:[...], suggestionRows?:[...], currentRadii?:{ areaId: mi },
//     dismissedKeys?:["area_radius:<areaId>", ...], allReactions?:bool }

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { learnRadii } from '../assets/js/refinement/radius.js';
import { planRadii, renderRadiusSql } from '../assets/js/refinement/radius-persistence.js';
import { resolveConfig } from '../assets/js/refinement/config.js';
import { radiusOverridesFromOverrides } from '../assets/js/refinement/view.js';
import { genuineReactions } from '../assets/js/listings/reaction-provenance.js';
import { haversineKm, bearingDeg, MILES_PER_KM } from './listings-normalise.mjs';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Area centres (id → {lat,lng}) for bearing maths — from THE canonical
 *  universe, includeDisabled so historic reactions in paused/disabled areas
 *  keep their geometry (step 2.7). */
async function loadAreaCentres() {
  const { loadUniverseFromRepo } = await import('./lib/geofence-universe.mjs');
  const { villages } = await loadUniverseFromRepo({ includeDisabled: true });
  return new Map(villages.map((v) => [v.id, { lat: v.lat, lng: v.lng }]));
}

/**
 * Enrich reactions with a `bearing` (deg from the town centre) and a coords-derived
 * `distance_mi`, by joining each reaction's listing to its coordinates. This unlocks the
 * directional petals AND recovers distance for likes whose snapshot lacked it. Reactions
 * that don't resolve to coords are returned unchanged (they still feed the scalar radius).
 */
function enrichBearings(reactions, listingCoords, centres) {
  return reactions.map((r) => {
    const snap = r.listing_snapshot || {};
    const areaId = snap.area_id;
    const rmId = snap.rightmove_id != null ? String(snap.rightmove_id) : null;
    const here = rmId ? listingCoords.get(rmId) : null;
    const centre = areaId ? centres.get(areaId) : null;
    if (!here || !centre) return r;
    const distance_mi = haversineKm(centre, here) * MILES_PER_KM;
    const bearing = bearingDeg(centre, here);
    return { ...r, bearing, listing_snapshot: { ...snap, distance_mi } };
  });
}

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

/**
 * Apply the plan over PostgREST with the service role (no SUPABASE_DB_URL / psql needed).
 * The service role bypasses RLS, so it can write the engine tables directly. The plan's
 * rows already carry the resolved sticky status + override-folded radius (planRadii), so a
 * merge-duplicates UPSERT writes exactly what renderRadiusSql would. Idempotent.
 */
async function restUpsert(table, rows, onConflict) {
  if (!rows || !rows.length) return 0;
  const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: `${onConflict ? 'resolution=merge-duplicates,' : ''}return=minimal`,
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`UPSERT ${table} ${res.status}: ${await res.text()}`);
  return rows.length;
}

async function applyPlanViaRest(plan) {
  if (!SERVICE_KEY) throw new Error('--apply needs SUPABASE_SERVICE_ROLE_KEY');
  const t = await restUpsert('area_search_tuning', plan.tuningUpserts, 'area_id');
  const s = await restUpsert('refinement_suggestions', plan.suggestionUpserts, 'household_id,dimension,value');
  await restUpsert('sync_log', [{ actor: 'system', action: 'update', table_name: 'area_search_tuning', at: plan.now }]);
  process.stderr.write(`  applied via REST (service role): ${t} tuning + ${s} suggestion upserts + 1 sync_log\n`);
}

/** Build the current applied-radius map from existing tuning rows (override wins). */
function currentRadiiFrom(tuningRows) {
  const out = {};
  for (const r of tuningRows || []) {
    const mi = r.override_radius_mi != null ? Number(r.override_radius_mi)
      : r.search_radius_mi != null ? Number(r.search_radius_mi) : null;
    if (mi != null && Number.isFinite(mi)) out[r.area_id] = mi;
  }
  return out;
}

/**
 * Union the portal-set per-area radius overrides across households (learned_preferences
 * rows). The tuning table is area-global, so when households disagree we take the WIDEST
 * pin (max) — consistent with the union-by-max applied radius. Returns { areaId: miles }.
 */
function overridesFromLearned(prefsRows) {
  const out = {};
  for (const row of prefsRows || []) {
    const ov = radiusOverridesFromOverrides(row.overrides || {});
    for (const [areaId, mi] of Object.entries(ov)) {
      if (out[areaId] == null || mi > out[areaId]) out[areaId] = mi;
    }
  }
  return out;
}

async function loadInputs() {
  const fromFile = arg('--from-file');
  if (fromFile) {
    const bundle = JSON.parse(await readFile(fromFile, 'utf8'));
    const tuningRows = bundle.tuningRows || [];
    const overrides = bundle.overrides || overridesFromLearned(bundle.learnedPreferences);
    return {
      now: bundle.now || new Date().toISOString(),
      config: resolveConfig(bundle.config || {}),
      reactions: bundle.reactions || [],
      tuningRows,
      suggestionRows: bundle.suggestionRows || [],
      overrides,
      currentRadii: bundle.currentRadii || currentRadiiFrom(tuningRows),
      dismissedKeys: new Set(bundle.dismissedKeys || []),
      useAll: !!bundle.allReactions,
    };
  }
  if (!SERVICE_KEY) throw new Error('no service key — use --from-file <bundle.json> (build via MCP) for the sandbox path');
  // Cross-household reaction log (service role bypasses RLS). distance_mi + area_id live
  // in listing_snapshot; the rightmove_id lets us join coords for the directional bearing.
  const rawReactions = await restGetAll('listing_reactions?select=household_id,reaction,created_at,listing_snapshot');
  // Join listing coordinates (the snapshot has no lat/lng) + repo area centres, then
  // enrich each reaction with a bearing + coords-derived distance for the petal learner.
  const [coordRows, centres] = await Promise.all([
    restGetAll('listings?select=rightmove_id,lat,lng'),
    loadAreaCentres(),
  ]);
  const listingCoords = new Map(
    coordRows.filter((l) => l.lat != null && l.lng != null)
      .map((l) => [String(l.rightmove_id), { lat: Number(l.lat), lng: Number(l.lng) }]),
  );
  const reactions = enrichBearings(rawReactions, listingCoords, centres);
  const tuningRows = await restGetAll('area_search_tuning?select=area_id,search_radius_mi,override_radius_mi,explore_until,last_explored_at,recommended_radius_mi');
  const suggestionRows = await restGetAll("refinement_suggestions?select=household_id,dimension,value,status,runs_qualified,first_detected_at,snoozed_until&dimension=eq.area_radius");
  // Portal-set radius overrides live in learned_preferences.overrides (the portal can't
  // write the service-role-only tuning table). Resolve + union them here.
  const prefsRows = await restGetAll('learned_preferences?select=household_id,overrides');
  const overrides = overridesFromLearned(prefsRows);
  return {
    now: new Date().toISOString(),
    config: resolveConfig({}),
    reactions,
    tuningRows,
    suggestionRows,
    overrides,
    currentRadii: currentRadiiFrom(tuningRows),
    dismissedKeys: new Set(),
    useAll: process.argv.includes('--all-reactions'),
  };
}

async function main() {
  const { now, config, reactions, tuningRows, suggestionRows, overrides, currentRadii, dismissedKeys, useAll } = await loadInputs();
  // A pinned area's "current" radius is its override, so suggestion direction/threshold
  // compares against what the user actually chose (not the stale default).
  const effectiveCurrent = { ...currentRadii, ...overrides };

  // Radii must reflect GENUINE, one-at-a-time judgements — not the en-masse area/price
  // sweeps + administrative removals that dominate the log. Likes are always individual,
  // so the gate is unaffected, but dropping bulk/admin rejects keeps the distant-reject
  // waste honest. `--all-reactions` (or bundle.allReactions) bypasses the filter.
  const argvAll = process.argv.includes('--all-reactions') || useAll;
  const filtered = argvAll ? reactions : genuineReactions(reactions);
  if (!argvAll) {
    process.stderr.write(`  genuine-only filter: ${reactions.length} → ${filtered.length} reactions (dropped ${reactions.length - filtered.length} bulk/admin)\n`);
  }

  const learned = learnRadii(filtered, { config, now, currentRadii: effectiveCurrent });
  const plan = planRadii(learned, { now, tuningRows, suggestionRows, overrides, dismissedKeys });
  const sql = renderRadiusSql(plan);

  // Human-readable summary (stderr so stdout can be piped as pure SQL).
  const top = learned.areas.slice(0, 12).map((a) =>
    `    ${a.areaId}  ${a.currentMi}mi → ${a.recommendedMi}mi (disk ${a.searchMi}mi)  [${a.direction}]  `
    + `likes=${a.likeCount} hh=${a.contributingHouseholds}${a.directional ? ` petals=[${a.geofenceRadiiMi.join(',')}]` : ''}`);
  process.stderr.write(
    `\n  Radius tune\n`
    + `  reactions=${filtered.length}  areas tuned=${learned.areas.length}  suggestions=${learned.suggestions.length}  exploring=${plan.exploringCount}\n`
    + `  tuned areas:\n${top.join('\n') || '    (none cleared the like gate)'}\n\n`);

  // Apply modes:
  //   --apply       → write the plan over PostgREST with the service role (CI default;
  //                   needs only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — no DB URL/psql).
  //   --emit-sql f  → write the SQL plan to a file (sandbox / psql path).
  //   (neither)     → print the SQL plan to stdout (dry run / pipe into psql).
  const emit = arg('--emit-sql');
  if (process.argv.includes('--apply')) {
    await applyPlanViaRest(plan);
  } else if (emit) {
    await writeFile(emit, `${sql}\n`, 'utf8');
    process.stderr.write(`  SQL plan → ${emit}  (${plan.tuningUpserts.length} tuning + ${plan.suggestionUpserts.length} suggestion upserts + 1 sync_log)\n`);
  } else {
    process.stdout.write(`${sql}\n`);
  }
}

main().catch((e) => { process.stderr.write(`radius-tune failed: ${e.message}\n`); process.exit(1); });
