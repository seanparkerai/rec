// page-setup.js — thin coordinator for the onboarding wizard. Loads the current
// user-state blobs (treating null / _SAMPLE as empty so a fresh household never sees the
// "Jane Smith" fixture), seeds the wizard, and routes to Your Profile on finish.
import {
  getProfile, getCriteria, getFinances, getGoals, getHouseholdAreas, hasRealUserData,
  saveProfile, saveCriteria, saveFinances, saveGoals, removeHouseholdArea, getCurrentUser,
} from './storage.js';
import { url } from './config.js';
import { byId } from './dom.js';
import { createWizard } from './setup/wizard.js';

// A populated blob is cloned for in-wizard mutation; null / _SAMPLE → start empty.
const cleanBlob = (b) => {
  if (!hasRealUserData(b)) return {};
  try { return structuredClone(b); } catch { return JSON.parse(JSON.stringify(b)); }
};

async function init() {
  const root = byId('wizard-root');
  if (!root) return;

  const user = await getCurrentUser();
  const [p, c, f, g] = await Promise.all([getProfile(), getCriteria(), getFinances(), getGoals()]);
  // Only seed already-selected areas for a real session — getHouseholdAreas() falls back
  // to the FULL catalog when there's no household context (offline/local-dev), which must
  // NOT show up as 196 pre-chosen areas in the wizard.
  const areas = user ? await getHouseholdAreas() : [];
  const chosen = Array.isArray(areas) ? areas.map((a) => ({ id: a.id, name: a.name || a.id })) : [];
  const state = {
    profile: cleanBlob(p), criteria: cleanBlob(c), finances: cleanBlob(f), goals: cleanBlob(g),
    areas: chosen, areaCount: chosen.length,
  };

  createWizard(root, {
    state,
    accessors: { saveProfile, saveCriteria, saveFinances, saveGoals },
    areaApi: { remove: removeHouseholdArea },
    onFinish: () => { location.assign(url('pages/profile.html')); },
  });
}

init();
