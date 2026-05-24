// components.js — shell bootstrap: inject shared partials, mark active nav, wire theme toggle.
// Loaded on every page as <script type="module">.
import { url, STORAGE_NS } from './config.js';

const THEME_KEY = `${STORAGE_NS}:theme`;

/* ---------- Partial includes: <div data-include="components/header.html"></div> ---------- */
async function injectIncludes() {
  const nodes = [...document.querySelectorAll('[data-include]')];
  await Promise.all(nodes.map(async (el) => {
    const path = el.getAttribute('data-include');
    try {
      const res = await fetch(url(path));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const tpl = document.createElement('template');
      tpl.innerHTML = html.trim();
      el.replaceWith(tpl.content);
    } catch (e) {
      console.error('Include failed:', path, e);
      el.replaceWith(document.createComment(`include failed: ${path}`));
    }
  }));
}

/* ---------- Active nav + resolve data-nav hrefs ---------- */
function normalisePath(p) {
  return new URL(p, location.origin).pathname.replace(/index\.html$/, '').replace(/\/+$/, '');
}
function setActiveNav() {
  const here = normalisePath(location.href);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const target = url(a.dataset.nav);
    a.setAttribute('href', target);
    if (normalisePath(target) === here) a.setAttribute('aria-current', 'page');
  });
}

/* ---------- Theme: system by default, manual override persisted ---------- */
function effectiveTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(saved) {
  if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  else document.documentElement.removeAttribute('data-theme');
}
function updateToggle(btn) {
  const dark = effectiveTheme() === 'dark';
  btn.textContent = dark ? '☀︎ Light' : '☾ Dark';
  btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}
function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY));
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  updateToggle(btn);
  btn.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    updateToggle(btn);
  });
}

/* ---------- Scroll-shrink header ---------- */
function initScrollShrink() {
  const set = () => {
    document.documentElement.toggleAttribute('data-scrolled', window.scrollY > 4);
  };
  set();
  window.addEventListener('scroll', set, { passive: true });
}

/* Apply saved theme ASAP to reduce flash (before includes resolve). */
applyTheme(localStorage.getItem(THEME_KEY));

injectIncludes().then(() => {
  setActiveNav();
  initTheme();
  initScrollShrink();
  document.dispatchEvent(new CustomEvent('shell:ready'));
});

export { injectIncludes, setActiveNav, initTheme, effectiveTheme };
