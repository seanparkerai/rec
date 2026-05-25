// data-loader.js — low-level cached JSON loading from /data.
import { url } from './config.js';

const cache = new Map();

/**
 * Load a JSON dataset. `name` may be a bare name ("areas") → data/areas.json,
 * or an app-root-relative path ending in .json.
 */
export async function loadJSON(name) {
  const path = name.endsWith('.json') ? name : `data/${name}.json`;
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(url(path));
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  const data = await res.json();
  cache.set(path, data);
  return data;
}

/** Clear the in-memory cache (used by tests). */
export function clearCache() { cache.clear(); }
