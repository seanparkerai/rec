// storage/refinement.js — READ-ONLY access to engine-derived refinement state
// (Stage 4, docs/REFINEMENT_PLAN.md §4). The scheduled job (tools/refinement-run.mjs)
// WRITES refinement_suggestions / refinement_runs; the portal only READS them here.
// There are deliberately NO write methods in this module — the user-facing levers
// (hide / stop-searching / dismiss / snooze) arrive in Stage 5/6 and will live in
// their own storage methods. Reads go straight to Supabase (these rows are
// engine-managed, regenerated each run; no localStorage write-through is needed).
import { _initSb, _getHid } from './core.js';

/** All refinement suggestions for the current household (engine-derived, read-only). */
export async function getRefinementSuggestions() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return [];
  try {
    const { data, error } = await sb
      .from('refinement_suggestions')
      .select('dimension, value, metrics, tier, status, first_detected_at, last_evaluated_at, runs_qualified, snoozed_until')
      .eq('household_id', hid);
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.error('storage: read refinement_suggestions', e.message);
    return [];
  }
}

/** The most recent evaluation run (backs the model-confidence meter, §4.6). */
export async function getRefinementMeta() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from('refinement_runs')
      .select('run_at, params, candidates_evaluated, actionable_count')
      .eq('household_id', hid)
      .order('run_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (e) {
    console.error('storage: read refinement_runs', e.message);
    return null;
  }
}
