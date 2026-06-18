// storage/user-state/singletons.js — singleton user-state blobs (profile, criteria
// + its quick mutations, finances, goals, journey progress). Split from storage/user-state.js.
import { _get, _save } from '../core.js';

export async function getProfile(opts = {})   { return _get('profile',   'profile',   'fixtures/profile.sample',  opts.onUpdate || null); }
export async function saveProfile(d)          { return _save('profile',  'profile',   d); }

export async function getCriteria(opts = {})  { return _get('criteria',  'criteria',  'fixtures/criteria.sample', opts.onUpdate || null); }
export async function saveCriteria(d)         { return _save('criteria', 'criteria',  d); }

// ── Refinement "Apply" writers — targeted criteria merges ─────────────────────
// One-click Apply on a refinement suggestion (assets/js/suggestions/apply.js) mutates
// exactly one slice of the criteria blob, preserving everything else. Each reads the
// current criteria, merges, and re-saves via saveCriteria (localStorage write-through
// + Supabase upsert). Per-area radius lives under location.areaRadiusOverrides — a
// household override map honoured by the map rings and the feed's per-area radius filter
// (the content `areas` table radius stays the shared default/fallback).
const _normType = (s) => String(s ?? '').trim().toLowerCase();

/** Tighten (or widen) the search radius for ONE area; null clears the override. */
export async function setAreaRadiusOverride(areaId, miles) {
  if (!areaId || !Number.isFinite(Number(miles))) return false;
  const cri = (await getCriteria()) || {};
  const location = { ...(cri.location || {}) };
  const overrides = { ...(location.areaRadiusOverrides || {}) };
  overrides[areaId] = Number(miles);
  location.areaRadiusOverrides = overrides;
  await saveCriteria({ ...cri, location });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('search-radius-changed', { detail: { areaId, searchRadiusMi: Number(miles) } }));
  }
  return true;
}

/** Remove a per-area radius override (revert to the area's default radius). */
export async function clearAreaRadiusOverride(areaId) {
  if (!areaId) return false;
  const cri = (await getCriteria()) || {};
  const location = { ...(cri.location || {}) };
  const overrides = { ...(location.areaRadiusOverrides || {}) };
  if (!(areaId in overrides)) return true;
  delete overrides[areaId];
  if (Object.keys(overrides).length) location.areaRadiusOverrides = overrides;
  else delete location.areaRadiusOverrides;
  await saveCriteria({ ...cri, location });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('search-radius-changed', { detail: { areaId } }));
  }
  return true;
}

/** Raise the budget ceiling so liked-but-over-budget homes fit. No-op if not higher. */
export async function raiseBudgetMax(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return false;
  const cri = (await getCriteria()) || {};
  const budget = { ...(cri.budget || {}) };
  if (Number(budget.max) >= v) return true; // already covers it
  budget.max = v;
  await saveCriteria({ ...cri, budget });
  return true;
}

/** Lower the bedroom minimum so smaller liked homes clear the bar. No-op if not lower. */
export async function lowerMinBeds(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) return false;
  const cri = (await getCriteria()) || {};
  const size = { ...(cri.size || {}) };
  if (Number(size.minBeds) <= v) return true;
  size.minBeds = v;
  await saveCriteria({ ...cri, size });
  return true;
}

/** Re-accept a property type (remove it from the excluded list), case-insensitively. */
export async function acceptPropertyType(type) {
  const t = _normType(type);
  if (!t) return false;
  const cri = (await getCriteria()) || {};
  const prefs = { ...(cri.propertyTypePrefs || {}) };
  const excluded = (prefs.excluded || []).filter((e) => _normType(e) !== t);
  prefs.excluded = excluded;
  await saveCriteria({ ...cri, propertyTypePrefs: prefs });
  return true;
}

/** Exclude a property type (add to the excluded list), de-duped case-insensitively. */
export async function excludePropertyType(type) {
  const raw = String(type ?? '').trim();
  const t = _normType(raw);
  if (!t) return false;
  const cri = (await getCriteria()) || {};
  const prefs = { ...(cri.propertyTypePrefs || {}) };
  const excluded = [...(prefs.excluded || [])];
  if (!excluded.some((e) => _normType(e) === t)) excluded.push(raw);
  prefs.excluded = excluded;
  await saveCriteria({ ...cri, propertyTypePrefs: prefs });
  return true;
}

export async function getFinances(opts = {})  { return _get('finances',  'finances',  'fixtures/finances.sample', opts.onUpdate || null); }
export async function saveFinances(d)         { return _save('finances', 'finances',  d); }

// v3 — goals (blob pattern)
export async function getGoals(opts = {})     { return _get('goals',     'goals',     'fixtures/goals.sample',    opts.onUpdate || null); }
export async function saveGoals(d)            { return _save('goals',    'goals',     d); }

// v3 — buying-journey progress (blob; the set of ticked task ids from
// data/journey.json). Source of truth = Supabase; no seed JSON — tick-state
// starts empty like shortlist/zones. Defaults to { tasks: {} } when absent.
export async function getJourneyProgress(opts = {}) {
  return (await _get('journey-progress', 'journey_progress', null, opts.onUpdate || null)) ?? { tasks: {} };
}
export async function saveJourneyProgress(d)  { return _save('journey-progress', 'journey_progress', d); }
