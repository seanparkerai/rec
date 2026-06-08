// page-profile-page.js — coordinator for the unified "Your Profile" page.
// Replaces the previous save-bar proxy module and adds the data-guard.
//
// 1. Data-guard (runs before render): an empty household — no Supabase row, so
//    getProfile() returns the redacted `_SAMPLE` fixture (or null) — is routed to
//    the onboarding wizard instead of rendering synthetic placeholder data. Flash
//    is prevented by html[data-profile-state="pending"] (set by a blocking inline
//    <head> script, mirroring auth-guard.js); this module clears it once a populated
//    household is confirmed, or navigates away to setup before anything is visible.
// 2. Save-bar proxy: the sticky bottom bar delegates to the criteria section's own
//    Cancel/Save buttons (preserving the prior save-bar proxy behaviour).
import { getProfile, hasRealUserData } from './storage.js';
import { url } from './config.js';
import { byId, on } from './dom.js';

(async () => {
  const html = document.documentElement;
  try {
    const profile = await getProfile();
    if (!hasRealUserData(profile)) {
      // Page stays hidden (pending) — we're navigating to onboarding.
      location.replace(url('pages/setup.html'));
      return;
    }
  } catch (e) {
    console.error('profile guard error', e);
  }
  // Populated household (or guard error) — reveal the page.
  html.removeAttribute('data-profile-state');
})();

// Save-bar proxy: delegate to the criteria section's own Cancel/Save buttons.
on(byId('save-bar-cancel'), 'click', () => byId('btn-cancel')?.click());
on(byId('save-bar-save'),   'click', () => byId('btn-save')?.click());
