// storage.js — the storage abstraction.
// Today: read JSON content from /data, overlay user edits from localStorage.
// Later: swap these implementations for fetch('/api/...') without touching pages.
import { loadJSON } from './data-loader.js';
import { STORAGE_NS } from './config.js';

const key = (k) => `${STORAGE_NS}:${k}`;

function readLocal(k) {
  try { const v = localStorage.getItem(key(k)); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function writeLocal(k, v) {
  try { localStorage.setItem(key(k), JSON.stringify(v)); return true; }
  catch { return false; }
}
function removeLocal(k) { try { localStorage.removeItem(key(k)); } catch { /* ignore */ } }

// --- User-editable datasets: localStorage overlay over the JSON template ---
export async function getProfile()  { return readLocal('profile')  ?? await loadJSON('profile'); }
export function       saveProfile(d){ return writeLocal('profile', d); }

export async function getCriteria() { return readLocal('criteria') ?? await loadJSON('criteria'); }
export function       saveCriteria(d){ return writeLocal('criteria', d); }

export async function getFinances() { return readLocal('finances') ?? await loadJSON('finances'); }
export function       saveFinances(d){ return writeLocal('finances', d); }

// --- Repo-owned content (read-only from the app) ---
// `areas` is the lightweight directory index (id, name, town, county, postcode,
// coords, status, houseTypeIds, …) — used by the directory, map, home and
// house-types pages. The full per-area record (overview, schools, prices,
// sources, …) lives at data/areas/<id>.json and is fetched on demand via
// getAreaDetail(id), which is what the detail page calls.
export async function getAreas()         { return await loadJSON('areas'); }
export async function getAreaDetail(id)  { return await loadJSON(`data/areas/${id}.json`); }
export async function getHouseTypes()    { return await loadJSON('house-types'); }

// --- Purely client-side state ---
export function getShortlist()    { return readLocal('shortlist') ?? []; }
export function saveShortlist(d)  { return writeLocal('shortlist', d); }
export function getDrawnZones()   { return readLocal('zones') ?? null; }
export function saveDrawnZones(g) { return writeLocal('zones', g); }

// Low-level helpers (exposed for tests / advanced use)
export const _internal = { key, readLocal, writeLocal, removeLocal };
