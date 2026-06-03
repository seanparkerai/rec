// storage/outreach.js (REFACTOR P8): outreach/contacts/area-review split from storage.js.
import { _get, _save, _initSb } from './core.js';

// ── Outreach + Contacts (Phase 3 — approved extension) ────────────────
export async function getContacts()        { return _get('contacts',  'contacts',  null, null) ?? { agents: [], brokers: [], solicitors: [], surveyors: [] }; }
export async function saveContacts(d)      { return _save('contacts', 'contacts',  d); }
export async function getOutreachLog()     { return _get('outreach',  'outreach',  null, null) ?? []; }
export async function saveOutreachLog(d)   { return _save('outreach', 'outreach',  d); }

// v3 Step5 — area review confirmations (blob per household: { confirmed: { id: isoTimestamp } })
export async function getAreaConfirmations(opts = {}) {
  return _get('area-confirmations', 'area_confirmations', null, opts.onUpdate || null);
}
export async function saveAreaConfirmations(d) {
  return _save('area-confirmations', 'area_confirmations', d);
}

// v3 Step5 — area review data (reads all areas from the Supabase content mirror)
// Returns [{ id, name, active, status, coords, coordsSource, rightmove }] or null.
export async function getAreaReviewData() {
  const sb = await _initSb();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('areas')
      .select('id, data')
      .order('id');
    if (error) throw error;
    return (data ?? []).map(({ id, data: d }) => ({
      id,
      name: d?.name ?? id,
      active: d?.active !== false,
      status: d?.status ?? 'directory',
      coords: d?.coords ?? null,
      coordsSource: d?.coordsSource ?? null,
      rightmove: d?.rightmove ?? null,
    }));
  } catch (e) {
    console.error('storage: read areas review', e.message);
    return null;
  }
}
