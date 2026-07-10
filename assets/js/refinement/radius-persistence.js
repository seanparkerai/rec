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
 * @param {Object} [ctx.overrides]       portal-set radius overrides { areaId: miles } (from
 *   learned_preferences — the only place a user override originates, since the portal can't
 *   write the service-role-only tuning table directly). Wins over the learner.
 * @param {Set}    [ctx.dismissedKeys]   `area_radius:<areaId>` keys the user dismissed.
 * @param {Object} [ctx.ringRadii]       per-area drawn-ring radii { areaId: miles } (ADR 0010).
 * @param {number} [ctx.defaultRingMi]   the widest household global ring (default 3).
 * @param {Date|string} [ctx.now]
 * @returns {{ tuningUpserts:Array, suggestionUpserts:Array, exploringCount:number }}
 *
 * RING FLOOR (ADR 0010, 2026-07-10): the map's drawn ring is the user's trust surface —
 * the AUTO-APPLIED radius (search disk, geofence scalar, every petal) is floored at the
 * ring radius (ctx.ringRadii[areaId] ?? ctx.defaultRingMi ?? 3mi). The learner's honest
 * view survives untouched in recommended_radius_mi and in the tighten SUGGESTION — which,
 * when the user Applies it, moves the drawn ring and pins the override in one action
 * (tightenRadiusBoth), keeping ring == pipeline. A user override is exempt from the floor.
 */
export function planRadii(learned, ctx = {}) {
  const config = learned.config || {};
  const now = ctx.now ? new Date(ctx.now) : new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const dismissedKeys = ctx.dismissedKeys || new Set();
  const overrides = ctx.overrides || {};
  const ringRadii = ctx.ringRadii || {};
  const defaultRingMi = Number.isFinite(Number(ctx.defaultRingMi)) && Number(ctx.defaultRingMi) > 0
    ? Number(ctx.defaultRingMi) : (config.DEFAULT_RADIUS_MI || 3);
  const ringFloorFor = (areaId) => (Number(ringRadii[areaId]) > 0 ? Number(ringRadii[areaId]) : defaultRingMi);
  const everyMs = (config.RADIUS_EXPLORE_EVERY_DAYS || 7) * DAY_MS;
  const windowMs = (config.RADIUS_EXPLORE_WINDOW_H || 12) * HOUR_MS;

  const tuningByArea = new Map((ctx.tuningRows || []).map((r) => [r.area_id, r]));
  const learnedByArea = new Map(learned.areas.map((a) => [a.areaId, a]));
  const suggByKey = new Map(
    (ctx.suggestionRows || []).map((r) => [`${r.household_id}|${r.dimension}:${r.value}`, r]),
  );

  // Emit a tuning row for every area with a recommendation OR a portal override (so a user
  // can pin a radius even on an area whose like signal has since decayed below the gate).
  const areaIds = [...new Set([...learnedByArea.keys(), ...Object.keys(overrides)])].sort();

  const tuningUpserts = [];
  let exploringCount = 0;

  for (const areaId of areaIds) {
    const a = learnedByArea.get(areaId);
    const recommendedMi = a ? a.recommendedMi : null;
    const prior = tuningByArea.get(areaId);

    // A user override (from learned_preferences) wins; fall back to a previously-pinned DB
    // override when the map is unavailable (e.g. a file-mode bundle without prefs).
    const override = overrides[areaId] != null ? Number(overrides[areaId])
      : (prior && prior.override_radius_mi != null ? Number(prior.override_radius_mi) : null);
    const nSectors = config.RADIUS_SECTORS || 8;
    // An override pins the whole town to one radius (uniform petals). Otherwise the search
    // disk is the widest petal (covers every sector) and the geofence is per-sector —
    // each floored at the drawn ring (ADR 0010): the auto-applied radius may only ever
    // WIDEN scope relative to the map; a pin (explicit user consent) is exempt.
    const floor = ringFloorFor(areaId);
    const applied = override != null ? override
      : Math.max((a ? a.searchMi : recommendedMi) ?? floor, floor);
    const geofenceScalar = override != null ? override : Math.max(recommendedMi ?? floor, floor);
    const geofenceRadii = override != null ? Array(nSectors).fill(override)
      : (a && a.geofenceRadiiMi ? a.geofenceRadiiMi.map((p) => Math.max(p, floor)) : null);

    // Exploration cadence (time-based) — only for a learner-recommended area with NO
    // override (a pinned area is never widened behind the user's back). A fresh area gets a
    // staggered last_explored_at so areas don't all widen on the same day.
    let lastExplored = null;
    let exploreUntil = null;
    if (recommendedMi != null && override == null) {
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
        const offsetDays = hashInt(areaId) % (config.RADIUS_EXPLORE_EVERY_DAYS || 7);
        lastExplored = new Date(nowMs - offsetDays * DAY_MS).toISOString();
      }
    }

    tuningUpserts.push({
      area_id: areaId,
      geofence_radius_mi: geofenceScalar,
      search_radius_mi: applied,
      recommended_radius_mi: recommendedMi,
      override_radius_mi: override,
      geofence_radii: geofenceRadii,
      sample_size: a ? Math.round(a.sampleSize) : null,
      like_count: a ? a.likeCount : null,
      method: a ? a.method : 'override-only',
      confidence: a ? a.confidence : 'override',
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
      + 'override_radius_mi, geofence_radii, sample_size, like_count, method, confidence, '
      + 'explore_until, last_explored_at, computed_at, updated_at)';
    const tuples = plan.tuningUpserts.map((u) => `  (${[
      lit(u.area_id), lit(u.geofence_radius_mi), lit(u.search_radius_mi), lit(u.recommended_radius_mi),
      lit(u.override_radius_mi), u.geofence_radii ? jsonLit(u.geofence_radii) : 'NULL',
      lit(u.sample_size), lit(u.like_count), lit(u.method), lit(u.confidence),
      lit(u.explore_until), lit(u.last_explored_at), lit(u.computed_at), lit(u.updated_at),
    ].join(', ')})`);
    lines.push(
      `INSERT INTO area_search_tuning ${cols}\nVALUES\n${tuples.join(',\n')}\n`
      + 'ON CONFLICT (area_id) DO UPDATE SET\n'
      // EXCLUDED values are authoritative: the driver already folded the user override
      // (resolved from learned_preferences, the sole source) into search/geofence/petals.
      + '  recommended_radius_mi = EXCLUDED.recommended_radius_mi,\n'
      + '  override_radius_mi = EXCLUDED.override_radius_mi,\n'
      + '  search_radius_mi   = EXCLUDED.search_radius_mi,\n'
      + '  geofence_radius_mi = EXCLUDED.geofence_radius_mi,\n'
      + '  geofence_radii     = EXCLUDED.geofence_radii,\n'
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
