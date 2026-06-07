// auth-guard.js — checks for a Supabase session on every page load.
// If no session, redirects to login. On the login page, if a session exists, redirects home.
// If supabase-client.js is not present (pre-setup), does nothing.
//
// Flash prevention: pages set data-auth-state="pending" on <html> via a blocking
// <script> in <head>. This module removes the attribute once the session is confirmed,
// revealing the body. On redirect the page navigates away before anything is visible.

(async () => {
  const html = document.documentElement;
  const here     = location.pathname;
  const isLogin  = here.endsWith('/login.html');
  const isSetup  = here.endsWith('/setup.html');

  // The Setup page is always accessible — it contains the credential /
  // household configuration tools, so blocking it would trap users who
  // have a bad supabase-client.js or stale session.
  if (isSetup) {
    html.removeAttribute('data-auth-state');
    return;
  }

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
      location.replace(params.get('next') || '../index.html');
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

  // Session confirmed — reveal the page.
  html.removeAttribute('data-auth-state');
})();
