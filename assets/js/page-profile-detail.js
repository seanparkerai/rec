// page-profile-detail.js — the "Application detail" + "Areas" sections of Your Profile.
// Previously a read-only renderer; now an inline, always-editable surface driven by the
// SAME declarative field model the onboarding wizard uses (setup/steps.js) through the
// shared field engine (forms/field-renderer.js). Every edit autosaves through the
// storage accessors (write-through to localStorage + Supabase). The Areas section reuses
// the area-picker component. This is the heart of unifying signup and profile editing:
// one field definition, one renderer, one write path.
import {
  getProfile, getCriteria, getFinances, getGoals,
  saveProfile, saveCriteria, saveFinances, saveGoals, _internal, hasRealUserData,
} from './storage.js';
import { el, clear, byId, setText } from './dom.js';
import { STEPS, visibleFields } from './setup/steps.js';
import { makeAutosaver, getNested, setNested } from './setup/autosave.js';
import { createFieldRenderer } from './forms/field-renderer.js';
import { mountAreaPicker } from './areas/area-picker.js';

// The steps surfaced here as editable sections. Excludes the criteria-owned steps
// (ideal-home, mortgage — edited in the Search criteria section), the areas step
// (its own Areas section) and the review chrome step.
const DETAIL_STEP_IDS = ['welcome', 'about-you', 'work', 'income', 'outgoings-debts', 'savings-deposit', 'sensitive'];
// Friendlier headings in the profile context (steps.js titles suit a sequential flow).
const TITLE_OVERRIDE = { welcome: 'Your situation', 'about-you': 'Personal details' };

const clone = (b) => { try { return structuredClone(b || {}); } catch { return JSON.parse(JSON.stringify(b || {})); } };
// A populated blob is cloned for editing; the redacted _SAMPLE fixture (or null) that a
// fresh household receives is treated as EMPTY so a new user never sees sample data.
const cleanBlob = (b) => (hasRealUserData(b) ? clone(b) : {});

async function init() {
  const mount = byId('detail-sections');
  if (!mount) return;

  const [p, c, f, g] = await Promise.all([getProfile(), getCriteria(), getFinances(), getGoals()]);
  const state = { profile: cleanBlob(p), criteria: cleanBlob(c), finances: cleanBlob(f), goals: cleanBlob(g) };

  const SAVERS = { profile: saveProfile, criteria: saveCriteria, finances: saveFinances, goals: saveGoals };

  // Merge-on-save: other editors on this page (the editorial dialog, the savings editor,
  // the criteria section) write the same blobs from their own clones. To avoid reverting
  // their changes, we re-read the freshest local cache and apply ONLY the paths this
  // engine actually touched (fields.dirty), then adopt the merged base.
  let fields;
  function mergeSave(blobName) {
    const local = _internal.readLocal(blobName);
    // Build on the freshest REAL local cache; ignore the _SAMPLE seed so a new user's
    // first save persists their own data, not the redacted fixture.
    const fresh = hasRealUserData(local) ? local : {};
    for (const path of fields.dirty[blobName]) setNested(fresh, path, getNested(state[blobName], path));
    fields.dirty[blobName].clear();
    state[blobName] = fresh;
    SAVERS[blobName](fresh);
  }
  const saver = makeAutosaver({
    profile: () => mergeSave('profile'),
    criteria: () => mergeSave('criteria'),
    finances: () => mergeSave('finances'),
    goals: () => mergeSave('goals'),
  });
  fields = createFieldRenderer({
    state, saver,
    onChange: () => setText('detail-status', 'Changes save automatically.'),
    onBranchChange: () => renderSections(),
    // The area field is handled by the dedicated Areas section, not inline here.
  });

  function renderSections() {
    clear(mount);
    for (const id of DETAIL_STEP_IDS) {
      const step = STEPS.find((s) => s.id === id);
      if (!step) continue;
      if (typeof step.include === 'function' && !step.include(state)) continue;
      const vis = visibleFields(step, state).filter((fld) => fld.path !== '@areas');
      if (!vis.length) continue;

      const card = el('section', { class: 'profile-section card' });
      card.append(el('h3', {}, TITLE_OVERRIDE[id] || step.title));
      if (step.intro && id !== 'welcome') card.append(el('p', { class: 'muted' }, step.intro));
      const wrap = el('div', { class: 'wiz__fields' });
      for (const fld of vis) wrap.append(fields.renderField(fld));
      card.append(wrap);
      mount.append(card);
    }
  }

  setText('detail-status', 'Changes save automatically as you type.');
  renderSections();

  // Areas section — the reusable picker (same lookup/match-or-create as the wizard).
  const areasMount = byId('areas-mount');
  if (areasMount) { try { await mountAreaPicker(areasMount, {}); } catch (e) { console.error('area-picker mount', e); } }
}

init();
