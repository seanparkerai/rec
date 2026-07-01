// shell-core.js — pure shell mechanics: partial injection, nav resolution/active
// state, and theme application. Extracted from components.js (overhaul step 1.9)
// so the DOM test tier can exercise the shell without the storage/auth bootstrap
// chain (supabase-client.js is a CDN import Node cannot resolve).
//
// Every function takes its collaborators as optional parameters defaulting to the
// browser globals, so components.js calls them exactly as before while tests
// inject a jsdom document/location and a disk-backed fetch. No behaviour change.

import { url as configUrl, STORAGE_NS } from './config.js';

export const THEME_KEY = `${STORAGE_NS}:theme`;

/* ---------- Partial includes: <div data-include="components/header.html"></div> ---------- */
/**
 * @param {object} [opts]
 * @param {Document} [opts.doc]
 * @param {(p: string) => string} [opts.urlFor]
 * @param {(href: string) => Promise<{ok: boolean, status: number, text(): Promise<string>}>} [opts.fetchFn]
 */
export async function injectIncludes({
  doc = document,
  urlFor = configUrl,
  fetchFn = (href) => fetch(href),
} = {}) {
  const nodes = [...doc.querySelectorAll('[data-include]')];
  await Promise.all(nodes.map(async (el) => {
    const path = el.getAttribute('data-include') || '';
    try {
      const res = await fetchFn(urlFor(path));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const tpl = doc.createElement('template');
      tpl.innerHTML = html.trim();
      el.replaceWith(tpl.content);
    } catch (e) {
      console.error('Include failed:', path, e);
      el.replaceWith(doc.createComment(`include failed: ${path}`));
    }
  }));
}

/* ---------- Active nav + resolve data-nav hrefs ---------- */
/** @param {string} p  @param {{origin: string}} [loc] */
export function normalisePath(p, loc = location) {
  return new URL(p, loc.origin).pathname.replace(/index\.html$/, '').replace(/\/+$/, '');
}

/**
 * @param {object} [opts]
 * @param {Document} [opts.doc]
 * @param {{origin: string, href: string}} [opts.loc]
 * @param {(p: string) => string} [opts.urlFor]
 */
export function setActiveNav({ doc = document, loc = location, urlFor = configUrl } = {}) {
  const here = normalisePath(loc.href, loc);
  doc.querySelectorAll('[data-nav]').forEach((el) => {
    const a = /** @type {HTMLElement} */ (el);
    const target = urlFor(a.dataset.nav || '');
    a.setAttribute('href', target);
    if (normalisePath(target, loc) === here) a.setAttribute('aria-current', 'page');
  });
}

/* ---------- Theme: system by default, manual override persisted ---------- */
export function effectiveTheme({
  store = localStorage,
  prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches,
} = {}) {
  const saved = store.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return prefersDark() ? 'dark' : 'light';
}

/** @param {string|null} saved  @param {Document} [doc] */
export function applyTheme(saved, doc = document) {
  if (saved === 'light' || saved === 'dark') doc.documentElement.setAttribute('data-theme', saved);
  else doc.documentElement.removeAttribute('data-theme');
}

/** @param {Element} btn  @param {object} [opts] */
export function updateToggle(btn, opts = {}) {
  const dark = effectiveTheme(opts) === 'dark';
  // Toggle state via attribute + label only — the sun/moon SVGs are swapped by
  // CSS keyed on [aria-pressed]. Never write glyph characters into the button
  // (the old '☾'/'☀︎' fell back to a tofu box in UI fonts without those glyphs).
  btn.setAttribute('aria-pressed', String(dark));
  btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  const label = btn.querySelector('.theme-toggle__label');
  if (label) label.textContent = dark ? 'Light' : 'Dark';
}
