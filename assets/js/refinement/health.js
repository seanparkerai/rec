// refinement/health.js — engine-health view-model for the Trends page. PURE: no DOM,
// no I/O, injectable clock. The daily server evaluation (refinement-run.yml) can fail
// SILENTLY: its required-secrets guard skips the Evaluate/Apply steps while the workflow
// still reports green, so refinement_runs quietly stops gaining rows and the page shows
// month-old data with no hint anything is wrong (exactly what happened 2026-06-08 →
// 2026-07-05). This module turns "how old is the latest run row?" into an honest,
// user-facing state so staleness is a headline, not a silent lie.
//
// Diagnosis baked into the copy (secrets audit, 2026-07-05): SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY demonstrably work (the listings fetcher uses them daily);
// the one secret the refinement job needs on top is SUPABASE_DB_URL. So a stale state
// most likely means that single secret is missing — the ownerAction says exactly that.

/** A run older than this is presented as stale (daily cadence + generous slack). */
export const STALE_AFTER_HOURS = 36;

export const OWNER_ACTION =
  'Add the missing repo secret: GitHub → Settings → Secrets and variables → Actions → '
  + 'New repository secret → name SUPABASE_DB_URL, value = the Postgres connection string '
  + '(Supabase Dashboard → Connect → Connection string → URI, session pooler). '
  + 'Then Actions → refinement-run → Run workflow.';

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
    detail: 'The scheduled job reports green but is skipping its work — its secrets guard fails when '
      + 'the SUPABASE_DB_URL repo secret is missing. Trends on this page are computed live from your '
      + 'reactions either way; only fetcher-side enforcement waits on the job.',
    ownerAction: OWNER_ACTION,
  };
}
