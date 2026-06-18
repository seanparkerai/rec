// outreach/dialog.js — modal for drafting outreach messages: renders template preview, manages extra fields, handles mailto/copy/save actions. DOM-driven.

import { renderTemplate, buildMailto, filterContextByDataNeeded } from '../outreach-renderer.js';
import { saveEntry, newEntryId } from '../outreach-store.js';
import { esc, byId as $, on } from '../dom.js';
import { state } from './state.js';
import { buildCurrentContext, EXTRA_FIELDS } from './context.js';
import { renderLog } from './log.js';
import { showToast } from './toast.js';

export function openDialog(tmpl) {
  state.activeTemplate = tmpl;
  const dialog = $('outreach-dialog');
  if (!dialog) return;

  $('dialog-title').textContent = tmpl.title;

  const bpnList = $('bpn-list');
  bpnList.innerHTML = (tmpl.bestPracticeNotes || []).map((n) => `<li>${esc(n)}</li>`).join('');

  const sourcesList = $('sources-list');
  sourcesList.innerHTML = (tmpl.sources || []).map((s) =>
    `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`
  ).join('');

  populateContactSelect(tmpl.recipientRole);
  updateContextFieldVisibility(tmpl);
  buildExtraFields(tmpl);

  dialog.querySelectorAll('input, select, textarea').forEach((inp) => {
    inp.removeEventListener('input', updatePreview);
    inp.addEventListener('input', updatePreview);
    inp.removeEventListener('change', updatePreview);
    inp.addEventListener('change', updatePreview);
  });

  updatePreview();
  dialog.showModal();
}

function updateContextFieldVisibility(tmpl) {
  const dn = tmpl.dataNeeded || [];
  const needsPrice  = dn.some((p) => p.startsWith('listing.askingPrice') || p.startsWith('listing.agreedPrice'));
  const needsOffer  = dn.some((p) => p.startsWith('listing.offerAmount'));
  const needsPortal = dn.some((p) => p.startsWith('listing.portal'));
  const needsRef    = dn.some((p) => p.startsWith('listing.ref'));
  const needsTenure = dn.some((p) => p.startsWith('listing.tenure'));

  const toggle = (id, show) => { const el = $(id); if (el) el.hidden = !show; };
  toggle('ctx-price-wrap', needsPrice || needsOffer);
  toggle('ctx-offer-wrap', needsOffer);
  toggle('ctx-portal-wrap', needsPortal);
  toggle('ctx-ref-wrap', needsRef);
  toggle('ctx-tenure-wrap', needsTenure);
}

function buildExtraFields(tmpl) {
  const container = $('extra-fields');
  const section = $('extra-fields-section');
  if (!container) return;
  container.innerHTML = '';

  const BASE_PREFIXES = ['profile.', 'criteria.', 'finances.', 'contact.', 'listing.'];
  const extraKeys = (tmpl.dataNeeded || []).filter((key) =>
    !BASE_PREFIXES.some((pfx) => key.startsWith(pfx))
  );

  if (extraKeys.length === 0) {
    if (section) section.hidden = true;
    return;
  }
  if (section) section.hidden = false;

  for (const key of extraKeys) {
    const def = EXTRA_FIELDS[key] || { label: key, placeholder: '', type: 'text' };
    const inputId = `extra-${key.replace(/\./g, '-')}`;
    const div = document.createElement('div');
    div.className = 'dialog-field';
    div.innerHTML = `<label for="${esc(inputId)}">${esc(def.label)}</label>`;
    let input;
    if (def.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = def.type;
    }
    input.id = inputId;
    input.placeholder = def.placeholder;
    input.dataset.extraKey = key;
    div.appendChild(input);
    container.appendChild(div);
  }
}

function updatePreview() {
  if (!state.activeTemplate) return;

  const fullCtx = buildCurrentContext();
  const filtered = filterContextByDataNeeded(fullCtx, state.activeTemplate.dataNeeded);
  const { subject, body, missingFields } = renderTemplate(state.activeTemplate, filtered);

  const subjectEl = $('preview-subject-text');
  const bodyEl = $('preview-body-text');
  if (subjectEl) subjectEl.textContent = subject;
  if (bodyEl) bodyEl.textContent = body;

  const attachHint = state.activeTemplate.attachmentsHint || [];
  const attachEl = $('preview-attach');
  const attachList = $('preview-attach-list');
  if (attachEl) attachEl.hidden = attachHint.length === 0;
  if (attachList) attachList.textContent = attachHint.join(', ');

  const warnEl = $('missing-warn');
  const missingList = $('missing-list');
  if (warnEl && missingList) {
    if (missingFields.length > 0) {
      missingList.innerHTML = missingFields.map((f) => `<li>${esc(f)}</li>`).join('');
      warnEl.hidden = false;
    } else {
      warnEl.hidden = true;
    }
  }

  const dialog = $('outreach-dialog');
  if (dialog) {
    dialog._currentSubject = subject;
    dialog._currentBody = body;
  }
}

function populateContactSelect(role) {
  const sel = $('ctx-contact');
  if (!sel) return;
  sel.innerHTML = '<option value="">— select or type below —</option>';

  const roleMap = {
    'estate-agent': state.contacts?.agents ?? [],
    'mortgage-broker': state.contacts?.brokers ?? [],
    'solicitor': state.contacts?.solicitors ?? [],
    'surveyor': state.contacts?.surveyors ?? [],
  };
  const list = roleMap[role] || [];
  for (const c of list) {
    const opt = document.createElement('option');
    const nameKey = { 'estate-agent': 'agentName', 'mortgage-broker': 'brokerName', 'solicitor': 'solicitorName', 'surveyor': 'surveyorName' }[role] || 'agentName';
    const emailKey = { 'estate-agent': 'agentEmail', 'mortgage-broker': 'brokerEmail', 'solicitor': 'solicitorEmail', 'surveyor': 'surveyorEmail' }[role] || 'agentEmail';
    const phoneKey = { 'estate-agent': 'agentPhone', 'mortgage-broker': 'brokerPhone', 'solicitor': 'solicitorPhone', 'surveyor': 'surveyorPhone' }[role] || 'agentPhone';
    const mapped = {};
    mapped[nameKey] = c.name;
    mapped[emailKey] = c.email;
    mapped[phoneKey] = c.phone;
    if (role === 'solicitor') mapped.solicitorFirm = c.firm;
    if (role === 'solicitor') mapped.solicitorEmail = c.email;
    opt.value = JSON.stringify(mapped);
    opt.textContent = c.name + (c.firm ? ` — ${c.firm}` : '');
    sel.appendChild(opt);
  }
}

export function bindDialog() {
  const dialog = $('outreach-dialog');
  const closeBtn = $('dialog-close');
  const btnMailto = $('btn-mailto');
  const btnCopy = $('btn-copy');
  const btnSave = $('btn-save');

  on(closeBtn, 'click', closeDialog);
  on(dialog, 'click', (e) => { if (e.target === dialog) closeDialog(); });
  on(dialog, 'keydown', (e) => { if (e.key === 'Escape') closeDialog(); });

  on(btnMailto, 'click', () => {
    const subject = dialog._currentSubject || '';
    const body = dialog._currentBody || '';
    const { mailto, useClipboard } = buildMailto({ subject, body });
    if (mailto && !useClipboard) {
      window.location.href = mailto;
    } else {
      navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`)
        .then(() => showToast('Draft copied — mailto: too long for mail client'))
        .catch(() => showToast('Could not copy — paste from preview', true));
    }
    autoSaveDrafted('sent');
    renderLog();
  });

  on(btnCopy, 'click', () => {
    const subject = dialog._currentSubject || '';
    const body = dialog._currentBody || '';
    navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`)
      .then(() => showToast('Draft copied to clipboard'))
      .catch(() => showToast('Copy failed — select text in preview and copy manually', true));
    autoSaveDrafted('drafted');
    renderLog();
  });

  on(btnSave, 'click', () => {
    autoSaveDrafted('drafted');
    renderLog();
    showToast('Saved to outreach log');
  });
}

function closeDialog() {
  const dialog = $('outreach-dialog');
  dialog?.close();
  state.activeTemplate = null;
  state._returnFocus?.focus();
}

async function autoSaveDrafted(status) {
  if (!state.activeTemplate) return;
  const dialog = $('outreach-dialog');
  const address = $('ctx-address')?.value?.trim() || '';
  const entry = {
    id: newEntryId(),
    templateId: state.activeTemplate.id,
    templateTitle: state.activeTemplate.title,
    recipientRole: state.activeTemplate.recipientRole,
    contactName: $('ctx-contact-name')?.value?.trim() || '',
    propertyAddress: address,
    subject: dialog?._currentSubject || '',
    body: dialog?._currentBody || '',
    status,
    sentAt: status === 'sent' ? new Date().toISOString() : null,
    repliedAt: null,
    notes: '',
    createdAt: new Date().toISOString(),
  };
  state.logEntries = await saveEntry(entry);
}
