// auth-guard.js — checks for a Supabase session on every page load.
// If no session, redirects to login. On the login page, if a session exists, redirects home.
// If supabase-client.js is not present (pre-setup), does nothing so the site still works.

(async () => {
  const here = location.pathname;
  const isLogin = here.endsWith('/login.html');
  const isSetup = here.endsWith('/setup.html');

  // Allow setup page through unconditionally.
  if (isSetup) return;

  let supabase;
  try {
    const mod = await import('./supabase-client.js');
    supabase = mod.supabase;
  } catch {
    // supabase-client.js not created yet — pre-setup mode, skip guard.
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();

  if (isLogin) {
    if (session) {
      const params = new URLSearchParams(location.search);
      location.replace(params.get('next') || '../index.html');
    }
    return;
  }

  if (!session) {
    const next = encodeURIComponent(location.href);
    // Resolve the login page path relative to the app root.
    const loginBase = new URL('../../pages/login.html', import.meta.url).href;
    location.replace(`${loginBase}?next=${next}`);
  }
})();
