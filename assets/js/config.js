// config.js — single source of truth for the site's base URL.
// Resolves from this module's own URL, so absolute paths work both locally
// (served at "/") and on GitHub project Pages (served at "/rec/").
// config.js lives at <root>/assets/js/config.js → ../../ === <root>/

export const APP_BASE = new URL('../../', import.meta.url).href;

/** Resolve an app-root-relative path to an absolute URL. */
export const url = (p) => new URL(String(p).replace(/^\/+/, ''), APP_BASE).href;

export const STORAGE_NS = 'rec';
