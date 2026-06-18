// storage/user-state/shortlist.js — shortlist record (ids + personal-status +
// ratings) and drawn map zones. Split from storage/user-state.js.
import { _get, _sbGet, _sbUpsert, readLocal, writeLocal, _normShortlist } from '../core.js';
import { isPersonalStatus } from '../../listings/reactions.js';

// Shortlist follows the _get pattern (Supabase-first, localStorage write-through cache).
//
// Record shape (v3 L3): the shortlist row's `data` jsonb is normalised to
// `{ ids: string[], status: { [id]: personalStatus }, ratings: { [id]: 1..10 } }`.
// The personal-status map (new/saved/viewed/offered/rejected) and the 1–10 priority
// ratings map both live ON this existing record — they are NOT parallel state
// machines. Legacy rows stored a bare `string[]`; `_normShortlist` reads every form
// so getShortlist() keeps returning a plain id array unchanged.
export async function getShortlist(opts = {}) {
  const onUpdate = opts.onUpdate ? (rec) => opts.onUpdate(_normShortlist(rec).ids) : null;
  const rec = await _get('shortlist', 'shortlist', null, onUpdate);
  return _normShortlist(rec).ids;
}

// saveShortlist(ids) preserves the personal-status and ratings maps for ids that
// survive, so toggling the shortlist never wipes a status or rating set on the same
// record.
export function saveShortlist(ids) {
  const arr = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
  const prev = _normShortlist(readLocal('shortlist'));
  const status = {};
  const ratings = {};
  for (const id of arr) {
    if (prev.status[id]) status[id] = prev.status[id];
    if (prev.ratings[id]) ratings[id] = prev.ratings[id];
  }
  const rec = { ids: arr, status, ratings };
  writeLocal('shortlist', rec);
  _sbUpsert('shortlist', rec);
  return true;
}

// Personal-status lifecycle map (id → new/saved/viewed/offered/rejected), read
// from the same shortlist record.
export async function getShortlistStatuses(opts = {}) {
  const onUpdate = opts.onUpdate ? (rec) => opts.onUpdate(_normShortlist(rec).status) : null;
  const rec = await _get('shortlist', 'shortlist', null, onUpdate);
  return _normShortlist(rec).status;
}

// Set (or clear, when status is null/'') the personal status for one id. Setting
// a status also adds the id to the shortlist, since the status lives on that
// record. Re-reads the freshest record first so a status change never clobbers
// shortlist ids set on another device.
export async function setShortlistStatus(id, status) {
  if (!id) return false;
  if (status != null && status !== '' && !isPersonalStatus(status)) {
    console.error('storage: invalid shortlist status', status);
    return false;
  }
  const rec = _normShortlist((await _sbGet('shortlist')) ?? readLocal('shortlist'));
  const ids = new Set(rec.ids);
  const map = { ...rec.status };
  if (status == null || status === '') { delete map[id]; }
  else { map[id] = status; ids.add(id); }
  const next = { ids: [...ids], status: map, ratings: { ...rec.ratings } };
  writeLocal('shortlist', next);
  _sbUpsert('shortlist', next);
  return true;
}

// 1–10 priority ratings map (id → integer 1..10), read from the same shortlist
// record. A rating expresses how strongly a saved listing matters; it feeds the
// fit score as a positive-only nudge (see listing-fit.js) and orders the saved view.
export async function getListingRatings(opts = {}) {
  const onUpdate = opts.onUpdate ? (rec) => opts.onUpdate(_normShortlist(rec).ratings) : null;
  const rec = await _get('shortlist', 'shortlist', null, onUpdate);
  return _normShortlist(rec).ratings;
}

// Set (or clear, when rating is null) the 1–10 rating for one id. Setting a rating
// also adds the id to the shortlist, since the rating lives on that record. Re-reads
// the freshest record first so a rating change never clobbers ids/status set on
// another device, and preserves the personal-status map untouched.
export async function setListingRating(id, rating) {
  if (!id) return false;
  let val = null;
  if (rating != null && rating !== '') {
    val = Math.round(Number(rating));
    if (!Number.isFinite(val) || val < 1 || val > 10) {
      console.error('storage: invalid listing rating', rating);
      return false;
    }
  }
  const rec = _normShortlist((await _sbGet('shortlist')) ?? readLocal('shortlist'));
  const ids = new Set(rec.ids);
  const map = { ...rec.ratings };
  if (val == null) { delete map[id]; }
  else { map[id] = val; ids.add(id); }
  const next = { ids: [...ids], status: { ...rec.status }, ratings: map };
  writeLocal('shortlist', next);
  _sbUpsert('shortlist', next);
  return true;
}
export function getDrawnZones()   { return readLocal('zones') ?? null; }
export function saveDrawnZones(g) { writeLocal('zones', g); _sbUpsert('zones', g); return true; }
