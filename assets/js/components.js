// components.js — shell bootstrap: inject shared partials, mark active nav, wire theme toggle.
// Loaded on every page as <script type="module">.
import { url, STORAGE_NS } from './config.js';
import { signOut, getCurrentUser } from './storage.js';
import './auth-guard.js';

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

function initHeaderHeightVar() {
  const setH = () => {
    const h = document.querySelector('.site-header')?.offsetHeight || 64;
    document.documentElement.style.setProperty('--header-h', `${h}px`);
  };
  setH();
  window.addEventListener('resize', setH, { passive: true });
  new MutationObserver(setH).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ['data-scrolled'] }
  );
}

/* Apply saved theme ASAP to reduce flash (before includes resolve). */
applyTheme(localStorage.getItem(THEME_KEY));

injectIncludes().then(async () => {
  setActiveNav();
  initTheme();
  initScrollShrink();
  initHeaderHeightVar();
  hideSetupNavIfComplete();
  await initHeaderUser();
  document.dispatchEvent(new CustomEvent('shell:ready'));
});

function hideSetupNavIfComplete() {
  try {
    const raw = localStorage.getItem(`${STORAGE_NS}:setup-progress`);
    if (!raw) return;
    const progress = JSON.parse(raw);
    const STEP_IDS = [
      'chk-1-1','chk-1-2','chk-1-3',
      'chk-2-1','chk-2-2','chk-2-3',
      'chk-3-1','chk-3-2','chk-3-3',
      'chk-4-1','chk-4-2','chk-4-3',
      'chk-5-1','chk-5-2','chk-5-3',
    ];
    const allDone = STEP_IDS.every(id => progress[id]);
    if (allDone) {
      const li = document.getElementById('nav-setup-item');
      if (li) li.hidden = true;
    }
  } catch { /* ignore */ }
}

async function initHeaderUser() {
  try {
    const user = await getCurrentUser();
    if (!user) return;
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
