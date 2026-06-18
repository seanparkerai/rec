// storage/listings/learned.js — learned preferences (Layer-2 derived weights +
// Layer-3 overrides), conflict snooze/dismiss state, and the recompute path that
// retrains derived weights from the whole append-only reaction log. Split from
// storage/listings.js. Uses the shared paged-log helper in ./_reactions-core.js.
import { readLocal, writeLocal, _initSb, _getHid, _toast, _normShortlist } from '../core.js';
import { deriveWeights } from '../../learned-preferences.js';
import { _fetchAllReactionRows } from './_reactions-core.js';

// ── Learned preferences (v3 L4 — distilled reaction weights) ───────────────
// User-state, household-scoped. ONE row per household: `derived` (Layer 2,
// recomputed from the reaction log) + `overrides` (Layer 3, manual/AI intent).
// Cached + revalidated like the other user-state reads.
async function _sbGetLearnedPrefs() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from('learned_preferences')
      .select('derived, overrides, dismissals')
      .eq('household_id', hid)
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (e) {
    console.error('storage: read learned_preferences', e.message);
    return null;
  }
}

export async function getLearnedPreferences(opts = {}) {
  const cached = readLocal('learned-preferences');
  if (cached !== null) {
    _sbGetLearnedPrefs().then((row) => {
      if (!row) return;
      const fresh = { derived: row.derived ?? {}, overrides: row.overrides ?? {}, dismissals: row.dismissals ?? {} };
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal('learned-preferences', fresh);
        if (opts.onUpdate) opts.onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  const row = await _sbGetLearnedPrefs();
  const val = { derived: row?.derived ?? {}, overrides: row?.overrides ?? {}, dismissals: row?.dismissals ?? {} };
  if (row) writeLocal('learned-preferences', val);
  return val;
}

export async function saveLearnedPreferences({ derived, overrides, dismissals } = {}) {
  const prev = readLocal('learned-preferences') || {};
  const next = {
    derived: derived ?? prev.derived ?? {},
    overrides: overrides ?? prev.overrides ?? {},
    dismissals: dismissals ?? prev.dismissals ?? {},
  };
  writeLocal('learned-preferences', next);
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { error } = await sb.from('learned_preferences').upsert(
      { household_id: hid, derived: next.derived, overrides: next.overrides, dismissals: next.dismissals, updated_at: new Date().toISOString() },
      { onConflict: 'household_id' }
    );
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('storage: write learned_preferences', e.message);
    _toast(`Sync error (learned_preferences): ${e.message}`, true);
    return false;
  }
}

// v3 L5: record a conflict-prompt dismissal (key -> dismissed_until ISO) on the
// learned_preferences row, preserving derived + overrides.
export async function dismissConflict(key, dismissedUntil) {
  if (!key) return false;
  const prev = readLocal('learned-preferences') || (await _sbGetLearnedPrefs()) || {};
  const dismissals = { ...(prev.dismissals || {}), [key]: dismissedUntil };
  return saveLearnedPreferences({ derived: prev.derived || {}, overrides: prev.overrides || {}, dismissals });
}

// Unified Snooze/Dismiss for a LIVE conflict (not engine-backed): store the richer
// object form { kind:'snooze'|'dismiss', until } so the Trends view can label snoozed
// vs dismissed live conflicts. detectConflicts() reads both this and the legacy ISO
// string. Preserves derived + overrides like dismissConflict.
export async function setConflictState(key, { kind, until } = {}) {
  if (!key || !until) return false;
  const prev = readLocal('learned-preferences') || (await _sbGetLearnedPrefs()) || {};
  const dismissals = { ...(prev.dismissals || {}), [key]: { kind: kind || 'dismiss', until } };
  return saveLearnedPreferences({ derived: prev.derived || {}, overrides: prev.overrides || {}, dismissals });
}

/** Clear a live-conflict snooze/dismiss so it can re-surface (the undo). */
export async function clearConflictState(key) {
  if (!key) return false;
  const prev = readLocal('learned-preferences') || (await _sbGetLearnedPrefs()) || {};
  const dismissals = { ...(prev.dismissals || {}) };
  if (!(key in dismissals)) return true;
  delete dismissals[key];
  return saveLearnedPreferences({ derived: prev.derived || {}, overrides: prev.overrides || {}, dismissals });
}

// Recompute path: read the full append-only reaction log (with snapshots), run
// the pure deriveWeights(), persist the new `derived`, PRESERVE `overrides`.
// Returns the fresh { derived, overrides, dismissals, log } so callers re-rank
// immediately AND reuse the rows it trained on (the log) without a second paged
// refetch of the whole table. A caller that already holds a fresh full log may
// pass it as `log` to skip the internal fetch entirely (P11b, additive).
export async function recomputeLearnedPreferences({ now, log = null } = {}) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  let rows = [];
  let statusMap = {};
  try {
    // Paged: deriveWeights() must train on the WHOLE append-only log, not the
    // oldest ~1000 rows a single select would return.
    const [reactRows, slRes] = await Promise.all([
      Array.isArray(log) ? log : _fetchAllReactionRows(sb, hid, {
        select: 'id, listing_id, reaction, reason, reasons, created_at, listing_snapshot',
        ascending: true,
      }),
      sb.from('shortlist')
        .select('data')
        .eq('household_id', hid)
        .limit(1),
    ]);
    if (slRes.error) throw slRes.error;
    rows = reactRows ?? [];
    statusMap = _normShortlist(slRes.data?.[0]?.data).status;
  } catch (e) {
    console.error('storage: recompute read listing_reactions', e.message);
    return null;
  }
  const { derived } = deriveWeights(rows, now ? { now, statusMap } : { statusMap });
  const existing = readLocal('learned-preferences') || (await _sbGetLearnedPrefs()) || {};
  const overrides = existing.overrides ?? {};
  const dismissals = existing.dismissals ?? {};
  await saveLearnedPreferences({ derived, overrides, dismissals });
  return { derived, overrides, dismissals, log: rows };
}
