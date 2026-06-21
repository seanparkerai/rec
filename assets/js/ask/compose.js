// ask/compose.js — the guided "Draft a message" experience inside Ask.
//
// Two halves:
//  1) A launcher <dialog> that frames outreach as selectable options (who? what
//     situation? which property? what tone?) plus a free-text escape hatch, then
//     composes ONE structured "[COMPOSE]" turn and sends it on the compose model.
//  2) A draft-card renderer that upgrades the assistant's ```outreach-draft``` block
//     into an editable card with Copy / Open in mail / Save to log + refine chips.
//
// The edge function DRAFTS only (read-only); the human commits every send/save here
// (CLAUDE.md §18.4 — portal writes go through storage.js). Pico-first, tokens-only,
// WCAG AA; the draft card never weakens transcript.js's escape-first rendering.
import { loadJSON } from '../data-loader.js';
import { getListings, getContacts } from '../storage.js';
import { saveEntry, newEntryId } from '../outreach-store.js';
import { buildMailto } from '../outreach-renderer.js';

const COMPOSE_MODEL = 'claude-sonnet-4-6';   // authoring is a generation task → Sonnet (§3.3)
const COMPOSE_MAX_TOKENS = 1536;             // subject + body + note + refinements

const RECIPIENTS = [
  { role: 'estate-agent', label: 'Estate agent' },
  { role: 'mortgage-broker', label: 'Mortgage broker' },
  { role: 'solicitor', label: 'Solicitor' },
  { role: 'surveyor', label: 'Surveyor' },
  { role: 'vendor', label: 'Vendor' },
  { role: 'removals', label: 'Removals' },
  { role: 'insurance', label: 'Insurance' },
  { role: 'local-authority', label: 'Local authority' },
];

const TONES = [
  { id: 'warm-brief', label: 'Warm & brief' },
  { id: 'firm', label: 'Firm' },
  { id: 'formal', label: 'Formal' },
];

const REFINEMENTS = [
  { label: 'Shorter', text: 'Make it shorter and more concise.' },
  { label: 'Firmer', text: 'Make the tone a little firmer.' },
  { label: 'More formal', text: 'Make it more formal.' },
  { label: 'Add availability', text: 'Add two specific time options for a viewing or call, as editable placeholders.' },
];

const ROLE_CONTACT_KEY = {
  'estate-agent': 'agents', 'mortgage-broker': 'brokers',
  'solicitor': 'solicitors', 'surveyor': 'surveyors',
};

/**
 * Wire the compose launcher + draft cards.
 * @param {object} refs   { dialog, form, openButtons[], draftTemplate }
 * @param {Function} send page-ask send(text, { model, maxTokens })
 */
export function createCompose({ dialog, form, openButtons = [], draftTemplate }, send) {
  const $ = (sel) => form.querySelector(sel);
  const intentsEl = $('#ask-compose-intents');
  const customEl = $('#ask-compose-custom');
  const propertyEl = $('#ask-compose-property');
  const addressEl = $('#ask-compose-address');
  const notesEl = $('#ask-compose-notes');
  const cancelBtn = $('#ask-compose-cancel');

  let templates = [];
  let contacts = null;
  let loaded = false;
  // Context carried from the launch into the resulting draft card (and reused by
  // refinements), so Save-to-log and Open-in-mail have the recipient/property/contact.
  let lastBrief = null;

  async function ensureData() {
    if (loaded) return;
    loaded = true;
    try { templates = await loadJSON('outreach-templates'); } catch { templates = []; }
    try { contacts = await getContacts(); } catch { contacts = null; }
    populateProperties();
    renderIntents();
  }

  // ── Property options: live feed (label + ref) + a free-text address + None. ──
  async function populateProperties() {
    if (!propertyEl) return;
    let rows = [];
    try { rows = await getListings({ status: 'live', limit: 60 }); } catch { rows = []; }
    const opts = ['<option value="">No specific property</option>'];
    for (const r of rows) {
      const ref = r.rightmove_id;
      if (!ref) continue;
      const price = Number(r.price) ? ` — £${Number(r.price).toLocaleString('en-GB')}` : '';
      const label = `${r.address ?? r.title ?? `Listing ${ref}`}${price}`;
      opts.push(`<option value="${esc(String(ref))}">${esc(label)}</option>`);
    }
    opts.push('<option value="__address__">Type an address…</option>');
    propertyEl.innerHTML = opts.join('');
  }

  propertyEl?.addEventListener('change', () => {
    const typed = propertyEl.value === '__address__';
    if (addressEl) addressEl.hidden = !typed;
    if (typed) addressEl?.focus();
  });

  // ── Intent chips, scoped to the chosen recipient from the template catalogue. ──
  function selectedRole() {
    return form.querySelector('input[name="recipient"]:checked')?.value || 'estate-agent';
  }

  function renderIntents() {
    if (!intentsEl) return;
    const role = selectedRole();
    const forRole = templates.filter((t) => t.recipientRole === role);
    // De-dupe on title; fall back to a couple of generic intents if none on file.
    const seen = new Set();
    const items = [];
    for (const t of forRole) {
      const label = (t.title || '').replace(/^.*?—\s*/, '').trim() || t.description || t.id;
      if (label && !seen.has(label)) { seen.add(label); items.push(label); }
    }
    if (!items.length) items.push('Make an enquiry', 'Ask a question', 'Chase a reply');
    intentsEl.innerHTML = items.map((label, i) =>
      `<button type="button" class="ask-compose__chip" data-intent="${esc(label)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(label)}</button>`,
    ).join('');
  }

  form.querySelectorAll('input[name="recipient"]').forEach((r) =>
    r.addEventListener('change', renderIntents));

  intentsEl?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-intent]');
    if (!chip) return;
    intentsEl.querySelectorAll('[data-intent]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    chip.setAttribute('aria-pressed', 'true');
    if (customEl) customEl.value = '';
  });

  function effectiveIntent() {
    const custom = (customEl?.value || '').trim();
    if (custom) return custom;
    return intentsEl?.querySelector('[data-intent][aria-pressed="true"]')?.dataset.intent || '';
  }

  function resolveContact(role) {
    const key = ROLE_CONTACT_KEY[role];
    const list = (contacts && Array.isArray(contacts[key])) ? contacts[key] : [];
    return list[0] || null;
  }

  // ── Submit: compose the structured first turn and send it on the compose model. ──
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const role = selectedRole();
    const intent = effectiveIntent();
    const tone = form.querySelector('input[name="tone"]:checked')?.value || 'warm-brief';

    let propertyRef = null;
    let propertyLabel = '';
    if (propertyEl?.value === '__address__') {
      propertyLabel = (addressEl?.value || '').trim();
    } else if (propertyEl?.value) {
      propertyRef = propertyEl.value;
      propertyLabel = propertyEl.selectedOptions[0]?.textContent?.trim() || '';
    }
    const notes = (notesEl?.value || '').trim();
    const contact = resolveContact(role);

    lastBrief = {
      recipientRole: role,
      propertyAddress: propertyLabel || '',
      contactName: contact?.name || '',
      contactEmail: contact?.email || '',
    };

    const lines = ['[COMPOSE] Help me write an outreach email.', `Recipient: ${role}`];
    if (intent) lines.push(`Situation: ${intent}`);
    if (propertyRef) lines.push(`Property: rightmove ${propertyRef}${propertyLabel ? ` (${propertyLabel})` : ''}`);
    else if (propertyLabel) lines.push(`Property: ${propertyLabel}`);
    if (contact?.name) lines.push(`Contact: ${contact.name}`);
    lines.push(`Tone: ${tone}`);
    if (notes) lines.push(`Notes: ${notes}`);

    close();
    send(lines.join('\n'), { model: COMPOSE_MODEL, maxTokens: COMPOSE_MAX_TOKENS });
  });

  // ── Dialog open/close ──
  function open() {
    ensureData();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    form.querySelector('input[name="recipient"]')?.focus();
  }
  function close() {
    if (dialog.open) dialog.close();
  }
  cancelBtn?.addEventListener('click', close);
  openButtons.forEach((b) => b?.addEventListener('click', open));

  // Deep-link: ask.html?compose=<role>:<intent>:<ref>  (Phase 3 entry points).
  function seedFromQuery() {
    const q = new URLSearchParams(location.search).get('compose');
    if (!q) return;
    const [role, intent, ref] = q.split(':');
    ensureData().then(() => {
      const radio = form.querySelector(`input[name="recipient"][value="${cssEsc(role)}"]`);
      if (radio) { radio.checked = true; renderIntents(); }
      if (intent && customEl) customEl.value = decodeURIComponent(intent).replace(/-/g, ' ');
      if (ref && propertyEl) {
        const opt = [...propertyEl.options].find((o) => o.value === ref);
        if (opt) propertyEl.value = ref;
      }
      open();
    });
  }

  // ── Draft card: upgrade an outreach-draft block to an actionable card. ──
  function maybeRenderDraft(finished) {
    if (!finished?.contentEl || !draftTemplate) return false;
    const parsed = parseOutreachDraft(finished.text);
    if (!parsed) return false;
    renderDraftCard(finished, parsed);
    return true;
  }

  function renderDraftCard(finished, parsed) {
    const { contentEl } = finished;
    // Replace the raw fenced block with just the model's note/suggestions text.
    contentEl.textContent = parsed.after || '';
    const card = draftTemplate.content.firstElementChild.cloneNode(true);
    const subjectEl = card.querySelector('.ask-draft__subject');
    const bodyEl = card.querySelector('.ask-draft__body');
    const statusEl = card.querySelector('.ask-draft__status');
    subjectEl.value = parsed.subject;
    bodyEl.value = parsed.body;

    const say = (msg) => { if (statusEl) { statusEl.hidden = false; statusEl.textContent = msg; } };
    const fullText = () => `Subject: ${subjectEl.value}\n\n${bodyEl.value}`;

    card.querySelector('[data-act="copy"]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(fullText()); say('Copied to your clipboard.'); }
      catch { say('Copy failed — select the text manually.'); }
    });

    card.querySelector('[data-act="mail"]')?.addEventListener('click', async () => {
      const { mailto, useClipboard } = buildMailto({
        to: lastBrief?.contactEmail || '', subject: subjectEl.value, body: bodyEl.value,
      });
      if (useClipboard || !mailto) {
        try { await navigator.clipboard.writeText(fullText()); } catch { /* best-effort */ }
        say('This message is long — copied it to your clipboard to paste into your email.');
      } else {
        window.location.href = mailto;
        say('Opening your mail app…');
      }
    });

    card.querySelector('[data-act="save"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await saveEntry({
          id: newEntryId(),
          templateId: null,
          recipientRole: lastBrief?.recipientRole || null,
          contactName: lastBrief?.contactName || '',
          propertyAddress: lastBrief?.propertyAddress || '',
          subject: subjectEl.value,
          body: bodyEl.value,
          status: 'drafted',
          createdAt: new Date().toISOString(),
        });
        say('Saved to your messages log.');
      } catch {
        btn.disabled = false;
        say('Could not save — please try again.');
      }
    });

    card.querySelectorAll('[data-refine]').forEach((b) =>
      b.addEventListener('click', () => send(b.dataset.refine, { model: COMPOSE_MODEL, maxTokens: COMPOSE_MAX_TOKENS })));

    contentEl.insertAdjacentElement('afterend', card);
  }

  // Render the fixed refinement chips into the cloned template's container (once
  // per card) — keeps the markup in HTML minimal.
  function decorateTemplate() {
    if (!draftTemplate) return;
    const holder = draftTemplate.content.querySelector('.ask-draft__refine');
    if (holder && !holder.children.length) {
      holder.innerHTML = REFINEMENTS.map((r) =>
        `<button type="button" class="ask-compose__chip" data-refine="${esc(r.text)}">${esc(r.label)}</button>`).join('');
    }
  }
  decorateTemplate();

  seedFromQuery();
  return { open, maybeRenderDraft };
}

/**
 * Parse the assistant's ```outreach-draft``` block into { subject, body, after }.
 * `after` is the model's plain-text note + suggested refinements that follow the block.
 */
export function parseOutreachDraft(text) {
  const m = String(text ?? '').match(/```outreach-draft\s*\n([\s\S]*?)```/);
  if (!m) return null;
  const lines = m[1].split('\n');
  let subject = '';
  let i = 0;
  for (; i < lines.length; i++) {
    const sm = lines[i].match(/^\s*Subject:\s*(.*)$/i);
    if (sm) { subject = sm[1].trim(); i++; break; }
  }
  while (i < lines.length && !lines[i].trim()) i++;
  const body = lines.slice(i).join('\n').trim();
  const after = String(text).slice(m.index + m[0].length).trim();
  if (!subject && !body) return null;
  return { subject, body, after };
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// CSS.escape isn't universal in older WebViews; a minimal fallback for the role value.
const cssEsc = (s) => String(s ?? '').replace(/[^\w-]/g, '');
