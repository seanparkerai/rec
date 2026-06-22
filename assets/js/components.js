// components.js — shell bootstrap: inject shared partials, mark active nav, wire theme toggle.
// Loaded on every page as <script type="module">.
import { url, STORAGE_NS } from './config.js';
import { signOut, getCurrentUser } from './storage.js';
import './auth-guard.js';

// Always-HTTPS guard: if the page is served over plain http on a real host,
// upgrade to https immediately. Localhost/loopback is exempt so `python3 -m
// http.server` dev still works. (Primary enforcement is GitHub Pages "Enforce
// HTTPS" — this is a client-side belt-and-braces that also keeps the Ask
// Edge Function's https-only CORS origin matching.)
if (location.protocol === 'http:' &&
    !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname)) {
  location.replace(location.href.replace(/^http:/, 'https:'));
}

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
  // Toggle state via attribute + label only — the sun/moon SVGs are swapped by
  // CSS keyed on [aria-pressed]. Never write glyph characters into the button
  // (the old '☾'/'☀︎' fell back to a tofu box in UI fonts without those glyphs).
  btn.setAttribute('aria-pressed', String(dark));
  btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  const label = btn.querySelector('.theme-toggle__label');
  if (label) label.textContent = dark ? 'Light' : 'Dark';
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

/* ---------- Sidebar nav drawer (native <dialog>) ---------- */
function initNavDrawer() {
  const dialog = document.getElementById('nav-drawer');
  const toggle = document.getElementById('nav-toggle');
  if (!dialog || !toggle) return;

  const open = () => { if (!dialog.open) dialog.showModal(); };
  const close = () => { if (dialog.open) dialog.close(); };

  toggle.addEventListener('click', open);
  document.getElementById('nav-drawer-close')?.addEventListener('click', close);

  // Reflect open state on the burger for assistive tech.
  dialog.addEventListener('close', () => toggle.setAttribute('aria-expanded', 'false'));
  toggle.addEventListener('click', () => toggle.setAttribute('aria-expanded', 'true'));

  // Backdrop click (outside the drawer panel) closes it.
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return; // clicks on inner content bubble with their own target
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) close();
  });

  // Any nav link closes the drawer (covers same-page / hash links that don't navigate away).
  dialog.querySelectorAll('a[data-nav]').forEach((a) => a.addEventListener('click', close));
}

function initHeaderHeightVar() {
  const setH = () => {
    const h = document.querySelector('.site-header')?.offsetHeight || 64;
    document.documentElement.style.setProperty('--header-h', `${h}px`);
  };
  setH();
  window.addEventListener('resize', setH, { passive: true });
}

/* Apply saved theme ASAP to reduce flash (before includes resolve). */
applyTheme(localStorage.getItem(THEME_KEY));

injectIncludes().then(async () => {
  setActiveNav();
  initTheme();
  initNavDrawer();
  initHeaderHeightVar();
  await initHeaderUser();
  document.dispatchEvent(new CustomEvent('shell:ready'));
});


async function initHeaderUser() {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    // Reveal admin-only nav entries (the /live-feed kiosk link) for the dedicated
    // admin account. Latent for the locked kiosk itself, but keeps the link
    // present in the shared nav for admin@gr.com (see components/nav.html).
    if ((user.email || '').toLowerCase() === 'admin@gr.com') {
      document.querySelectorAll('[data-admin-only]').forEach((el) => { el.hidden = false; });
    }
    const userEl = document.getElementById('header-user');
    const signOutBtn = document.getElementById('btn-sign-out');
    if (userEl) {
      userEl.textContent = user.email;
      userEl.hidden = false;
    }
    if (signOutBtn) {
      signOutBtn.hidden = false;
      signOutBtn.addEventListener('click', async () => {
        await signOut();
        // Resolve login page path relative to config.js location
        const loginUrl = url('pages/login.html');
        location.replace(loginUrl);
      });
    }
  } catch { /* ignore — pre-setup mode */ }
}

export { injectIncludes, setActiveNav, initTheme, effectiveTheme };
