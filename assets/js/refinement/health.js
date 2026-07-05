// refinement/health.js — engine-health view-model for the Trends page. PURE: no DOM,
// no I/O, injectable clock. The daily server evaluation (refinement-run.yml) once failed
// SILENTLY for a month (2026-06-08 → 2026-07-05): its secrets guard skipped the apply
// steps while the workflow still reported green, so refinement_runs quietly stopped
// gaining rows. This module turns "how old is the latest run row?" into an honest,
// user-facing state so staleness is a headline, not a silent lie.
//
// Since the same-day fix the job applies via PostgREST using only SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY — secrets that already exist and are exercised daily by the
// listings fetcher; no extra secret can go missing again. A stale state therefore means
// the run itself errored (or the schedule stopped); the ownerAction points at the run
// log, never at minting credentials.

/** A run older than this is presented as stale (daily cadence + generous slack). */
export const STALE_AFTER_HOURS = 36;

export const OWNER_ACTION =
  'Open GitHub → Actions → refinement-run, check the latest run\'s log, and tap '
  + '"Run workflow" to retry. It needs only the SUPABASE_URL and '
  + 'SUPABASE_SERVICE_ROLE_KEY repo secrets, which the daily listings fetcher already '
  + 'uses — nothing new to create.';

/** Whole days between two dates (floored, never negative). */
function daysBetween(then, now) {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86400000));
}

/** Human "today" / "yesterday" / "N days ago". */
export function ageLabel(ageDays) {
  if (ageDays <= 0) return 'today';
  if (ageDays === 1) return 'yesterday';
  return `${ageDays} days ago`;
}

/**
 * Build the health view-model from the latest refinement_runs row.
 * @param {{ meta?: { run_at?: string }|null, now?: Date }} [opts]
 * @returns {{ state: 'fresh'|'stale'|'never', lastRunAt: Date|null, ageDays: number|null,
 *            headline: string, detail: string, ownerAction: string }}
 */
export function buildEngineHealth({ meta = null, now = new Date() } = {}) {
  const runAt = meta?.run_at ? new Date(meta.run_at) : null;
  if (!runAt || Number.isNaN(runAt.getTime())) {
    return {
      state: 'never', lastRunAt: null, ageDays: null,
      headline: 'The server engine has never evaluated your feedback.',
      detail: 'Trends on this page are computed live from your reactions, so nothing here is missing — '
        + 'but "stop searching" decisions only reach the fetcher once the daily job runs.',
      ownerAction: OWNER_ACTION,
    };
  }
  const ageHours = (now.getTime() - runAt.getTime()) / 3600000;
  const ageDays = daysBetween(runAt, now);
  if (ageHours < STALE_AFTER_HOURS) {
    return {
      state: 'fresh', lastRunAt: runAt, ageDays,
      headline: `Server engine in sync — last evaluated ${ageLabel(ageDays)}.`,
      detail: '', ownerAction: '',
    };
  }
  return {
    state: 'stale', lastRunAt: runAt, ageDays,
    headline: `The daily server evaluation last ran ${ageLabel(ageDays)}.`,
    detail: 'The scheduled job has not recorded a run recently — its latest run log will say why. '
      + 'Trends on this page are computed live from your reactions either way; only '
      + 'fetcher-side enforcement waits on the job.',
    ownerAction: OWNER_ACTION,
  };
}
