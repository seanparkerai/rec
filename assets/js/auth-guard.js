// auth-guard.js — checks for a Supabase session on every page load.
// If no session, redirects to login. On the login page, if a session exists, redirects home.
// If supabase-client.js is not present (pre-setup), does nothing.
//
// Flash prevention: pages set data-auth-state="pending" on <html> via a blocking
// <script> in <head>. This module removes the attribute once the session is confirmed,
// revealing the body. On redirect the page navigates away before anything is visible.

import { url } from './config.js';

// The admin kiosk account is confined to /live-feed; every other account is kept
// out of it (LIVE_FEED_PLAN §5 — access enforcement). Centralised here so the lock
// runs on every page load alongside the session check.
const ADMIN_EMAIL = 'admin@gr.com';
const LIVE_FEED = '/live-feed';

(async () => {
  const html = document.documentElement;
  const here     = location.pathname;
  const isLogin  = here.endsWith('/login.html');
  const onLiveFeed = here.includes(LIVE_FEED);

  let supabase;
  try {
    const mod = await import('./supabase-client.js');
    supabase = mod.supabase;
  } catch {
    // Pre-setup: no client yet — reveal and continue without auth.
    html.removeAttribute('data-auth-state');
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();

  if (isLogin) {
    html.removeAttribute('data-auth-state');
    if (session) {
      const params = new URLSearchParams(location.search);
      // The admin account always lands on its kiosk, ignoring any `next`.
      if ((session.user?.email || '').toLowerCase() === ADMIN_EMAIL) {
        location.replace(url('live-feed/'));
      } else {
        location.replace(params.get('next') || '../index.html');
      }
    }
    return;
  }

  if (!session) {
    // Page stays hidden (pending) — we're navigating away.
    const next = encodeURIComponent(location.href);
    const loginBase = new URL('../../pages/login.html', import.meta.url).href;
    location.replace(`${loginBase}?next=${next}`);
    return;
  }

  // Admin ⇔ /live-feed lock (page stays hidden during any redirect).
  const isAdmin = (session.user?.email || '').toLowerCase() === ADMIN_EMAIL;
  if (isAdmin && !onLiveFeed) { location.replace(url('live-feed/')); return; }
  if (!isAdmin && onLiveFeed) { location.replace(url('index.html')); return; }

  // Session confirmed — reveal the page.
  html.removeAttribute('data-auth-state');
})();
