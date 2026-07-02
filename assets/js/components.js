// components.js — shell bootstrap: inject shared partials, mark active nav, wire theme toggle.
// Loaded on every page as <script type="module">.
// THIN by design (step 3.3b): the pure mechanics live in shell-core.js, the
// side-effectful wiring in shell/{theme,nav-drawer,header-user}.js — this file
// only sequences them and supplies the real collaborators (storage, location).
import { url } from './config.js';
import { signOut, getCurrentUser } from './storage.js';
import './auth-guard.js';
import {
  THEME_KEY, injectIncludes, setActiveNav, applyTheme, effectiveTheme,
} from './shell-core.js';
import { initTheme } from './shell/theme.js';
import { initNavDrawer } from './shell/nav-drawer.js';
import { initHeaderUser } from './shell/header-user.js';

// Always-HTTPS guard: if the page is served over plain http on a real host,
// upgrade to https immediately. Localhost/loopback is exempt so `python3 -m
// http.server` dev still works. (Primary enforcement is GitHub Pages "Enforce
// HTTPS" — this is a client-side belt-and-braces that also keeps the Ask
// Edge Function's https-only CORS origin matching.)
if (location.protocol === 'http:' &&
    !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname)) {
  location.replace(location.href.replace(/^http:/, 'https:'));
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
  await initHeaderUser({
    getUser: getCurrentUser,
    doSignOut: signOut,
    navigate: (href) => location.replace(href),
    urlFor: url,
  });
  document.dispatchEvent(new CustomEvent('shell:ready'));
});

export { injectIncludes, setActiveNav, initTheme, effectiveTheme };
