// storage/user-state/readiness.js — the readiness checklist (row-per-item in
// readiness_items, cached locally). Split from storage/user-state.js.
import { _initSb, _getHid, _toast, readLocal, writeLocal } from '../core.js';
import { loadJSON } from '../../data-loader.js';

// v3 — readiness checklist (row-per-item; no blob).
export async function getReadinessChecklist(opts = {}) {
  const cached = readLocal('readiness');
  if (cached !== null) {
    _sbGetReadinessRows().then((fresh) => {
      if (!fresh) return;
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal('readiness', fresh);
        if (opts.onUpdate) opts.onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  const fresh = await _sbGetReadinessRows();
  if (fresh && fresh.length > 0) { writeLocal('readiness', fresh); return fresh; }
  // Fallback: derive from sample fixture so the dashboard works on a fresh install.
  try {
    const goals = await loadJSON('fixtures/goals.sample');
    const items = Object.entries(goals?.readiness?.checklist ?? {}).map(([key, val]) => ({
      item_key: key, item_label: key, completed: val === true, updated_at: null,
    }));
    writeLocal('readiness', items);
    return items;
  } catch { return []; }
}

export async function saveReadinessItem({ item_key, item_label, completed }) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { error } = await sb
      .from('readiness_checklist')
      .upsert(
        { household_id: hid, item_key, item_label: item_label ?? item_key, completed: !!completed, updated_at: new Date().toISOString() },
        { onConflict: 'household_id,item_key' }
      );
    if (error) throw error;
    // Refresh cache.
    const fresh = await _sbGetReadinessRows();
    if (fresh) writeLocal('readiness', fresh);
    return true;
  } catch (e) {
    console.error('storage: write readiness_checklist', e.message);
    _toast(`Sync error (readiness): ${e.message}`, true);
    return false;
  }
}

async function _sbGetReadinessRows() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from('readiness_checklist')
      .select('item_key, item_label, completed, updated_at')
      .eq('household_id', hid);
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.error('storage: read readiness_checklist', e.message);
    return null;
  }
}

