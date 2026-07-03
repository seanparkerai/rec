// page-profile-page.js — THE single coordinator for the unified "Your Profile" page
// (§19: one thin page entry). The page's three sibling modules are composed here in
// the load order the old per-<script> setup used, so behaviour is byte-identical:
// the editorial About card, then the Search criteria section, then the field-engine
// detail sections + Areas picker. profile.html loads ONLY this module (step 8.1).
//
// 1. First-run banner (runs before render): an empty household — no Supabase row, so
//    getProfile() returns the redacted `_SAMPLE` fixture (or null) — is no longer
//    bounced to a separate setup wizard. The profile itself IS the data-entry surface
//    (everything is editable inline), so we simply reveal the page and show a welcome
//    banner listing what's still needed, until real data exists. Flash is prevented by
//    html[data-profile-state="pending"] (set by a blocking inline <head> script); this
//    module clears it once auth/data is resolved.
// 2. Save-bar proxy: the sticky bottom bar delegates to the criteria section's own
//    Cancel/Save buttons (preserving the prior save-bar proxy behaviour).
import './page-profile.js';
import './page-criteria.js';
import './page-profile-detail.js';
import {
  getProfile, getCriteria, getHouseholdAreas, getCurrentUser, hasRealUserData,
} from './storage.js';
import { requiredGate } from './setup/validate.js';
import { byId, on, setText } from './dom.js';

(async () => {
  const html = document.documentElement;
  try {
    const profile = await getProfile();
    if (!hasRealUserData(profile)) {
      const banner = byId('first-run-banner');
      if (banner) banner.hidden = false;
      // Surface the few required items still missing (name, email, ≥1 area, budget).
      try {
        const [criteria, user] = await Promise.all([getCriteria(), getCurrentUser()]);
        const areas = user ? await getHouseholdAreas() : [];
        const gate = requiredGate({
          profile: hasRealUserData(profile) ? profile : {},
          criteria: hasRealUserData(criteria) ? criteria : {},
          areaCount: Array.isArray(areas) ? areas.length : 0,
        });
        if (!gate.ok) {
          setText('first-run-needed', `Still needed to start matching: ${gate.missing.map((m) => m.label).join(', ')}.`);
        }
      } catch (e) { console.error('first-run gate', e); }
    }
  } catch (e) {
    console.error('profile guard error', e);
  }
  // Reveal the page (populated, empty, or guard error — the profile is always editable).
  html.removeAttribute('data-profile-state');
})();

// Save-bar proxy: delegate to the criteria section's own Cancel/Save buttons.
on(byId('save-bar-cancel'), 'click', () => byId('btn-cancel')?.click());
on(byId('save-bar-save'),   'click', () => byId('btn-save')?.click());
