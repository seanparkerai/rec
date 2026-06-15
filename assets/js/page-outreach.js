// page-outreach.js — outreach page coordinator.
// All feature logic delegated to assets/js/outreach/ modules.
import { getProfile, getCriteria, getFinances } from './storage.js';
import { normalizeProfile } from './profile-schema.js';
import { getLog, getContacts } from './outreach-store.js';
import { state } from './outreach/state.js';
import { renderGrid } from './outreach/grid.js';
import { bindFilters } from './outreach/filters.js';
import { renderLog } from './outreach/log.js';
import { renderContacts } from './outreach/contacts.js';
import { bindDialog, openDialog } from './outreach/dialog.js';

async function init() {
  [state.templates, state.profile, state.criteria, state.finances, state.contacts, state.logEntries] = await Promise.all([
    fetch('../data/outreach-templates.json').then((r) => r.json()),
    getProfile(),
    getCriteria(),
    getFinances(),
    getContacts(),
    getLog(),
  ]);

  // Canonical shape exposes the flat fields outreach templates resolve
  // (profile.firstName / lastName / mobile / email / postcode).
  state.profile = normalizeProfile(state.profile);

  renderGrid();
  bindFilters();
  renderLog();
  renderContacts();
  bindDialog();

  // Deep-link: ?templateId=A1 or #new?templateId=A1
  const params = new URLSearchParams(location.search + location.hash.replace(/^#new\?/, ''));
  const deepId = params.get('templateId');
  if (deepId) {
    const tmpl = state.templates.find((t) => t.id === deepId);
    if (tmpl) openDialog(tmpl);
  }
}

document.addEventListener('shell:ready', init);
if (document.readyState !== 'loading') {
  setTimeout(init, 0);
} else {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
}
