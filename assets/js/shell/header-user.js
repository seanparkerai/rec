// shell/header-user.js — the signed-in header affordances (step 3.3b): user
// email, sign-out button, and the admin-only nav reveals. Storage/auth
// collaborators are injected by components.js so this module carries no
// import of the storage layer and the page tier can test the wiring.
/**
 * @param {object} opts
 * @param {Document} [opts.doc]
 * @param {() => Promise<{email?: string}|null>} opts.getUser
 * @param {() => Promise<unknown>} opts.doSignOut
 * @param {(href: string) => void} opts.navigate
 * @param {(p: string) => string} opts.urlFor
 */
export async function initHeaderUser({ doc = document, getUser, doSignOut, navigate, urlFor }) {
  try {
    const user = await getUser();
    if (!user) return;
    // Reveal admin-only nav entries (the /live-feed kiosk link) for the
    // dedicated admin account (see components/nav.html).
    if ((user.email || '').toLowerCase() === 'admin@gr.com') {
      doc.querySelectorAll('[data-admin-only]').forEach((el) => { el.hidden = false; });
    }
    const userEl = doc.getElementById('header-user');
    const signOutBtn = doc.getElementById('btn-sign-out');
    if (userEl) {
      userEl.textContent = user.email ?? '';
      userEl.hidden = false;
    }
    if (signOutBtn) {
      signOutBtn.hidden = false;
      signOutBtn.addEventListener('click', async () => {
        await doSignOut();
        navigate(urlFor('pages/login.html'));
      });
    }
  } catch { /* ignore — pre-setup mode */ }
}
