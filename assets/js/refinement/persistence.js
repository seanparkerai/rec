// refinement/persistence.js — Stage 3 planning layer (docs/REFINEMENT_PLAN.md §3).
// PURE: turns an engine run + current DB state into a set of intended mutations
// (suggestion upserts + one run-audit row + a sync_log entry). It does NO I/O — the
// driver (tools/refinement-run.mjs) or Claude-via-MCP executes the plan. NOTIFY-ONLY:
// nothing here touches `listings`, `criteria`, `zones`, or the scrape scope.
//
// The persistence gate (§2.6.5) is a read-back loop: prior `runs_qualified` comes from
// the existing suggestion rows (priorRunsFromRows) → fed to the engine → the engine
// returns the advanced count → written back here. Two runs therefore advance it by one.

const ENGINE_OWNED_STATUSES = new Set(['forming', 'actionable']);

/** Build the engine's `priorRunsQualified` map from existing suggestion rows (§2.6.5). */
export function priorRunsFromRows(rows = []) {
  const map = {};
  for (const r of rows) map[`${r.dimension}:${r.value}`] = r.runs_qualified || 0;
  return map;
}

/**
 * Is a candidate worth persisting? We track only values that are (a) confident enough
 * to be at least "forming", (b) backed by a real sample, and (c) leaning
 * disproportionate (lift > 1) — a value at or below baseline (a volume artefact) will
 * never become actionable, so it stays out of the patterns-forming list (plan §4.4).
 */
export function isTracked(c) {
  return c.tier !== 'none' && c.gates && c.gates.sample && c.lift > 1;
}

/**
 * Resolve the persisted status for a candidate given its prior row and dismissal state.
 * User-owned statuses (confirmed_hide/confirmed_scrape/dismissed/snoozed-until-expiry)
 * are STICKY — the engine never re-raises them (§3 "do not re-nag"). Otherwise the
 * engine decides: actionable → inbox; everything else tracked → forming (watch list).
 */
export function resolveStatus(candidate, priorRow, { now, dismissedKeys = new Set() }) {
  const key = `${candidate.dimension}:${candidate.value}`;
  if (dismissedKeys.has(key)) return 'dismissed';
  const prev = priorRow && priorRow.status;
  if (prev === 'dismissed') return 'dismissed';
  if (prev === 'confirmed_hide' || prev === 'confirmed_scrape') return prev;
  if (prev === 'snoozed') {
    const until = priorRow.snoozed_until ? new Date(priorRow.snoozed_until) : null;
    if (until && until > now) return 'snoozed'; // still snoozed
    // snooze expired → fall through to the engine's decision
  }
  return candidate.actionable ? 'actionable' : 'forming';
}

const round = (x, dp = 6) => (typeof x === 'number' && Number.isFinite(x)
  ? Number(x.toFixed(dp)) : x);

/** Compact §2.8 metrics for the `metrics` jsonb — counts/metrics only, never id lists. */
export function metricsOf(c, baseline) {
  return {
    n_eff: round(c.n_eff, 4),
    k_eff: round(c.k_eff, 4),
    n_raw: c.n_raw,
    k_raw: c.k_raw,
    p_hat: round(c.p_hat),
    wilson_lower: round(c.wilson_lower),
    lift: round(c.lift),
    p_value: round(c.p_value),
    fdr_significant: !!c.fdr_significant,
    distinct_rejected_listings: c.distinct_rejected_listings,
    volume_artefact: !!c.volume_artefact,
    qualifies_this_run: !!c.qualifies_this_run,
    gates: c.gates,
    baseline: round(baseline),
    reason: c.reason,
  };
}

/** The config snapshot recorded on the run-audit row (`refinement_runs.params`). */
export function paramsOf(config) {
  const keep = [
    'preset', 'WILSON_FLOOR', 'MIN_LIFT', 'PERSISTENCE_RUNS', 'FDR_Q', 'HALF_LIFE_DAYS',
    'GLOBAL_MIN_FEEDBACK', 'DIM_MIN_FEEDBACK', 'MIN_EFFECTIVE_SAMPLE', 'MIN_DISTINCT',
    'FORMING_FLOOR', 'FDR_PER_DIMENSION', 'EXCLUDE_PASSES',
  ];
  const out = {};
  for (const k of keep) out[k] = config[k];
  return out;
}

/**
 * Build the full persistence plan for one evaluation run.
 *
 * @param {object} engineRun  output of runRefinementEngine / scoreFromAggregates.
 * @param {object} ctx
 * @param {string} ctx.householdId
 * @param {Array}  [ctx.existingRows]    current refinement_suggestions rows (this household).
 * @param {Set}    [ctx.dismissedKeys]   `${dim}:${value}` keys the user has dismissed.
 * @param {Date|string} [ctx.now]
 * @returns {{ upserts:Array, runRow:object, actionableCount:number, trackedCount:number }}
 */
export function planRun(engineRun, ctx = {}) {
  const householdId = ctx.householdId;
  const now = ctx.now ? new Date(ctx.now) : new Date();
  const nowIso = now.toISOString();
  const dismissedKeys = ctx.dismissedKeys || new Set();
  const byKey = new Map((ctx.existingRows || []).map((r) => [`${r.dimension}:${r.value}`, r]));

  const upserts = [];
  let actionableCount = 0;

  for (const c of engineRun.candidates) {
    if (!isTracked(c)) continue;
    const key = `${c.dimension}:${c.value}`;
    const prior = byKey.get(key);
    const status = resolveStatus(c, prior, { now, dismissedKeys });
    if (status === 'actionable') actionableCount++;
    upserts.push({
      household_id: householdId,
      dimension: c.dimension,
      value: c.value,
      metrics: metricsOf(c, engineRun.baseline ? engineRun.baseline[c.dimension] : null),
      tier: c.tier,
      status,
      first_detected_at: prior && prior.first_detected_at ? prior.first_detected_at : nowIso,
      last_evaluated_at: nowIso,
      runs_qualified: c.runs_qualified,
      snoozed_until: prior && prior.snoozed_until ? prior.snoozed_until : null,
      updated_at: nowIso,
    });
  }

  const runRow = {
    household_id: householdId,
    run_at: nowIso,
    params: paramsOf(engineRun.config),
    candidates_evaluated: engineRun.candidates.length,
    actionable_count: actionableCount,
  };

  return { upserts, runRow, actionableCount, trackedCount: upserts.length };
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
 *   • a multi-row UPSERT into refinement_suggestions — ON CONFLICT updates metrics,
 *     tier, runs_qualified, last_evaluated_at, but NEVER overwrites a user-owned status
 *     (confirmed/dismissed/snoozed) nor first_detected_at / snoozed_until;
 *   • one refinement_runs audit row;
 *   • one sync_log entry (actor='system').
 * The CASE guard on status makes the upsert safe even against a concurrent user action.
 */
export function renderPlanSql(plan) {
  const lines = [];
  lines.push('BEGIN;');

  if (plan.upserts.length) {
    const cols = '(household_id, dimension, value, metrics, tier, status, first_detected_at, last_evaluated_at, runs_qualified, snoozed_until, updated_at)';
    const tuples = plan.upserts.map((u) => `  (${[
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

  const r = plan.runRow;
  lines.push(
    'WITH new_run AS (\n'
    + '  INSERT INTO refinement_runs (household_id, run_at, params, candidates_evaluated, actionable_count)\n'
    + `  VALUES (${lit(r.household_id)}, ${lit(r.run_at)}, ${jsonLit(r.params)}, ${lit(r.candidates_evaluated)}, ${lit(r.actionable_count)})\n`
    + '  RETURNING id\n'
    + ')\n'
    + "INSERT INTO sync_log (actor, action, table_name, row_id, at)\n"
    + `SELECT 'system', 'update', 'refinement_suggestions', id, ${lit(r.run_at)} FROM new_run;`,
  );

  lines.push('COMMIT;');
  return lines.join('\n\n');
}
