// refinement/radius-persistence.js — PURE planning layer for the per-area radius learner
// (radius.js). Turns a learner run + current DB state into intended mutations and renders
// them as ONE idempotent SQL batch. It does NO I/O — the driver (tools/radius-tune.mjs) or
// Claude-via-MCP executes the plan.
//
// TWO SINKS:
//   • area_search_tuning — auto-applied per-area radii (area-global) + the exploration-ring
//     cadence (explore_until / last_explored_at). A user override_radius_mi ALWAYS wins
//     over the learner and is never overwritten by the tuner.
//   • refinement_suggestions (dimension='area_radius') — the per-household tighten/widen
//     advice, riding the existing engine-proposes inbox. Reuses the sticky status logic of
//     persistence.js#resolveStatus so a user-confirmed / dismissed / snoozed radius row is
//     never re-nagged.
//
// EXPLORATION RING (anti-selection-bias). Tightening stops us scraping/showing homes beyond
// the learned radius, so the boundary can't be re-measured. Each area is rotated through an
// exploration window: every RADIUS_EXPLORE_EVERY_DAYS we set explore_until = now +
// RADIUS_EXPLORE_WINDOW_H (the fetcher then uses RADIUS_CEIL_MI for that area), staggered so
// areas don't all widen on the same day. Cadence is purely time-based (timestamps) — no
// monotonic run-index needed.

import { resolveStatus } from './persistence.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Deterministic 32-bit FNV-1a hash → stable per-area exploration stagger. */
function hashInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build the persistence plan for one radius-learner run.
 *
 * @param {ReturnType<import('./radius.js').learnRadii>} learned
 * @param {object} ctx
 * @param {Array}  [ctx.tuningRows]      current area_search_tuning rows.
 * @param {Array}  [ctx.suggestionRows]  current refinement_suggestions rows (dimension='area_radius').
 * @param {Set}    [ctx.dismissedKeys]   `area_radius:<areaId>` keys the user dismissed.
 * @param {Date|string} [ctx.now]
 * @returns {{ tuningUpserts:Array, suggestionUpserts:Array, exploringCount:number }}
 */
export function planRadii(learned, ctx = {}) {
  const config = learned.config || {};
  const now = ctx.now ? new Date(ctx.now) : new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const dismissedKeys = ctx.dismissedKeys || new Set();
  const everyMs = (config.RADIUS_EXPLORE_EVERY_DAYS || 7) * DAY_MS;
  const windowMs = (config.RADIUS_EXPLORE_WINDOW_H || 12) * HOUR_MS;

  const tuningByArea = new Map((ctx.tuningRows || []).map((r) => [r.area_id, r]));
  const suggByKey = new Map(
    (ctx.suggestionRows || []).map((r) => [`${r.household_id}|${r.dimension}:${r.value}`, r]),
  );

  const tuningUpserts = [];
  let exploringCount = 0;

  for (const a of learned.areas) {
    const prior = tuningByArea.get(a.areaId);

    // Exploration cadence (time-based). A fresh area gets a staggered last_explored_at in
    // the recent past so its first widening lands somewhere across the next cadence window.
    let lastExplored;
    let exploreUntil;
    if (prior && prior.last_explored_at) {
      const le = new Date(prior.last_explored_at).getTime();
      if (nowMs - le >= everyMs) {
        lastExplored = nowIso;
        exploreUntil = new Date(nowMs + windowMs).toISOString();
        exploringCount += 1;
      } else {
        lastExplored = prior.last_explored_at;
        exploreUntil = prior.explore_until || null; // may still be inside an active window
      }
    } else {
      const offsetDays = hashInt(a.areaId) % (config.RADIUS_EXPLORE_EVERY_DAYS || 7);
      lastExplored = new Date(nowMs - offsetDays * DAY_MS).toISOString();
      exploreUntil = null;
    }

    // A user override always wins and is never written by the tuner. Applied = override
    // ?? recommended (the SQL re-derives this with COALESCE so a live override set after
    // this read still wins).
    const override = prior && prior.override_radius_mi != null ? Number(prior.override_radius_mi) : null;
    const applied = override != null ? override : a.recommendedMi;

    tuningUpserts.push({
      area_id: a.areaId,
      geofence_radius_mi: applied,
      search_radius_mi: applied,
      recommended_radius_mi: a.recommendedMi,
      override_radius_mi: override,
      sample_size: Math.round(a.sampleSize),
      like_count: a.likeCount,
      method: a.method,
      confidence: a.confidence,
      explore_until: exploreUntil,
      last_explored_at: lastExplored,
      computed_at: nowIso,
      updated_at: nowIso,
    });
  }

  const suggestionUpserts = [];
  for (const s of learned.suggestions) {
    const key = `area_radius:${s.areaId}`;
    const prior = suggByKey.get(`${s.householdId}|${key}`);
    const status = resolveStatus(
      { dimension: 'area_radius', value: s.areaId, actionable: true },
      prior, { now, dismissedKeys },
    );
    suggestionUpserts.push({
      household_id: s.householdId,
      dimension: 'area_radius',
      value: s.areaId,
      metrics: {
        recommended_mi: s.recommendedMi,
        current_mi: s.currentMi,
        direction: s.direction,
        like_count: s.likeCount,
        sample_size: s.sampleSize,
        distant_reject_waste: s.distantRejectWaste,
        method: s.method,
        reason: s.reason,
      },
      tier: s.likeCount >= 2 * (config.RADIUS_MIN_LIKES || 5) ? 'strong' : 'confident',
      status,
      first_detected_at: prior && prior.first_detected_at ? prior.first_detected_at : nowIso,
      last_evaluated_at: nowIso,
      runs_qualified: (prior && prior.runs_qualified ? prior.runs_qualified : 0) + 1,
      snoozed_until: prior && prior.snoozed_until ? prior.snoozed_until : null,
      updated_at: nowIso,
    });
  }

  return { tuningUpserts, suggestionUpserts, exploringCount, now: nowIso };
}

// ── SQL rendering (parameter-safe literals; engine-controlled values) ────────────
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}
const jsonLit = (obj) => `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;

/**
 * Render the plan as one idempotent SQL batch:
 *   • UPSERT area_search_tuning — ON CONFLICT recomputes the applied radius as
 *     COALESCE(existing override, recommended) so a USER OVERRIDE always wins and is
 *     never clobbered by the tuner;
 *   • UPSERT refinement_suggestions (area_radius) — same status CASE guard as
 *     persistence.js#renderPlanSql, so user-owned statuses survive;
 *   • one sync_log entry (actor='system', table_name='area_search_tuning').
 * Empty plans still emit a valid (no-op) transaction.
 */
export function renderRadiusSql(plan) {
  const lines = ['BEGIN;'];

  if (plan.tuningUpserts.length) {
    const cols = '(area_id, geofence_radius_mi, search_radius_mi, recommended_radius_mi, '
      + 'override_radius_mi, sample_size, like_count, method, confidence, explore_until, '
      + 'last_explored_at, computed_at, updated_at)';
    const tuples = plan.tuningUpserts.map((u) => `  (${[
      lit(u.area_id), lit(u.geofence_radius_mi), lit(u.search_radius_mi), lit(u.recommended_radius_mi),
      lit(u.override_radius_mi), lit(u.sample_size), lit(u.like_count), lit(u.method), lit(u.confidence),
      lit(u.explore_until), lit(u.last_explored_at), lit(u.computed_at), lit(u.updated_at),
    ].join(', ')})`);
    lines.push(
      `INSERT INTO area_search_tuning ${cols}\nVALUES\n${tuples.join(',\n')}\n`
      + 'ON CONFLICT (area_id) DO UPDATE SET\n'
      + '  recommended_radius_mi = EXCLUDED.recommended_radius_mi,\n'
      // user override (kept on the existing row) always wins over the learner:
      + '  search_radius_mi   = COALESCE(area_search_tuning.override_radius_mi, EXCLUDED.recommended_radius_mi),\n'
      + '  geofence_radius_mi = COALESCE(area_search_tuning.override_radius_mi, EXCLUDED.recommended_radius_mi),\n'
      + '  sample_size = EXCLUDED.sample_size,\n'
      + '  like_count = EXCLUDED.like_count,\n'
      + '  method = EXCLUDED.method,\n'
      + '  confidence = EXCLUDED.confidence,\n'
      + '  explore_until = EXCLUDED.explore_until,\n'
      + '  last_explored_at = EXCLUDED.last_explored_at,\n'
      + '  computed_at = EXCLUDED.computed_at,\n'
      + '  updated_at = EXCLUDED.updated_at;',
    );
  }

  if (plan.suggestionUpserts.length) {
    const cols = '(household_id, dimension, value, metrics, tier, status, first_detected_at, '
      + 'last_evaluated_at, runs_qualified, snoozed_until, updated_at)';
    const tuples = plan.suggestionUpserts.map((u) => `  (${[
      lit(u.household_id), lit(u.dimension), lit(u.value), jsonLit(u.metrics), lit(u.tier),
      lit(u.status), lit(u.first_detected_at), lit(u.last_evaluated_at), lit(u.runs_qualified),
      lit(u.snoozed_until), lit(u.updated_at),
    ].join(', ')})`);
    lines.push(
      `INSERT INTO refinement_suggestions ${cols}\nVALUES\n${tuples.join(',\n')}\n`
      + 'ON CONFLICT (household_id, dimension, value) DO UPDATE SET\n'
      + '  metrics = EXCLUDED.metrics,\n'
      + '  tier = EXCLUDED.tier,\n'
      + '  status = CASE WHEN refinement_suggestions.status IN (\'forming\',\'actionable\')\n'
      + '             THEN EXCLUDED.status ELSE refinement_suggestions.status END,\n'
      + '  runs_qualified = EXCLUDED.runs_qualified,\n'
      + '  last_evaluated_at = EXCLUDED.last_evaluated_at,\n'
      + '  updated_at = EXCLUDED.updated_at;',
    );
  }

  lines.push(
    "INSERT INTO sync_log (actor, action, table_name, at)\n"
    + `VALUES ('system', 'update', 'area_search_tuning', ${lit(plan.now || new Date().toISOString())});`,
  );

  lines.push('COMMIT;');
  return lines.join('\n\n');
}
