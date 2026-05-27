// page-outreach.js — outreach generator page controller.
// Linear-dense anchor per DESIGN.md §1.
import { getProfile, getCriteria, getFinances } from './storage.js';
import { assembleContext, filterContextByDataNeeded, renderTemplate, buildMailto } from './outreach-renderer.js';
import { getLog, saveEntry, newEntryId, getContacts, saveContacts } from './outreach-store.js';
import { esc, byId as $, on } from './dom.js';

// ── State ────────────────────────────────────────────────────────────────
let templates = [];
let profile = null;
let criteria = null;
let finances = null;
let contacts = { agents: [], brokers: [], solicitors: [], surveyors: [] };
let logEntries = [];
let activeTemplate = null;
let activeStage = '';
let activeRole = '';
// Contact that was used to open the dialog (for deep-link pre-fill).
let _returnFocus = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────
async function init() {
  [templates, profile, criteria, finances, contacts, logEntries] = await Promise.all([
    fetch('../data/outreach-templates.json').then((r) => r.json()),
    getProfile(),
    getCriteria(),
    getFinances(),
    getContacts(),
    getLog(),
  ]);

  renderGrid();
  bindFilters();
  renderLog();
  renderContacts();
  bindDialog();

  // Deep-link: ?templateId=A1 or #new?templateId=A1
  const params = new URLSearchParams(location.search + location.hash.replace(/^#new\?/, ''));
  const deepId = params.get('templateId');
  if (deepId) {
    const tmpl = templates.find((t) => t.id === deepId);
    if (tmpl) openDialog(tmpl);
  }
}

// ── Grid ──────────────────────────────────────────────────────────────────
const ROLE_LABELS = {
  'estate-agent': 'Estate agent',
  'mortgage-broker': 'Mortgage broker',
  'solicitor': 'Solicitor',
  'surveyor': 'Surveyor',
  'vendor': 'Vendor',
  'local-authority': 'Local authority',
  'removals': 'Removals',
  'insurance': 'Insurance',
};
const STAGE_LABELS = {
  A: 'Search',
  B: 'Offer',
  C: 'Post-acceptance',
  D: 'Pre-completion',
};

function renderGrid() {
  const grid = $('template-grid');
  const empty = $('template-grid-empty');
  if (!grid) return;

  // Remove existing tiles.
  grid.querySelectorAll('.template-tile').forEach((el) => el.remove());

  const filtered = templates.filter((t) => {
    if (activeStage && t.stage !== activeStage) return false;
    if (activeRole && t.recipientRole !== activeRole) return false;
    return true;
  });

  if (filtered.length === 0) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  for (const tmpl of filtered) {
    const tile = document.createElement('div');
    tile.className = 'template-tile';
    tile.setAttribute('role', 'listitem');
    tile.dataset.templateId = tmpl.id;
    tile.innerHTML = `
      <div class="template-tile__tags">
        <span class="template-tile__stage">${esc(tmpl.id)} · ${esc(STAGE_LABELS[tmpl.stage] || tmpl.stageName)}</span>
        <span class="template-tile__role">${esc(ROLE_LABELS[tmpl.recipientRole] || tmpl.recipientRole)}</span>
      </div>
      <h3 class="template-tile__title">${esc(tmpl.title)}</h3>
      <p class="template-tile__desc">${esc(tmpl.description)}</p>
      <button type="button" class="template-tile__btn" data-id="${esc(tmpl.id)}">Generate</button>
    `;
    grid.appendChild(tile);
  }

  grid.querySelectorAll('.template-tile__btn').forEach((btn) => {
    on(btn, 'click', (e) => {
      _returnFocus = e.currentTarget;
      const tmpl = templates.find((t) => t.id === e.currentTarget.dataset.id);
      if (tmpl) openDialog(tmpl);
    });
  });
}

// ── Filters ────────────────────────────────────────────────────────────────
function bindFilters() {
  const stageBar = $('stage-filter');
  const roleBar = $('role-filter');

  stageBar?.querySelectorAll('.filter-chip').forEach((btn) => {
    on(btn, 'click', () => {
      stageBar.querySelectorAll('.filter-chip').forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      activeStage = btn.dataset.stage;
      renderGrid();
    });
  });

  roleBar?.querySelectorAll('.filter-chip').forEach((btn) => {
    on(btn, 'click', () => {
      roleBar.querySelectorAll('.filter-chip').forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
      activeRole = btn.dataset.role;
      renderGrid();
    });
  });
}

// ── Dialog ─────────────────────────────────────────────────────────────────
const EXTRA_FIELDS = {
  viewingDateOption1: { label: 'Viewing option 1', placeholder: 'e.g. Saturday 7 June, morning', type: 'text' },
  viewingDateOption2: { label: 'Viewing option 2', placeholder: 'e.g. Tuesday 10 June after 5pm', type: 'text' },
  offerDeadline:      { label: 'Offer deadline', placeholder: 'e.g. Friday 6 June at 5pm', type: 'text' },
  offerDate:          { label: 'Date offer was made', placeholder: 'e.g. 2 June 2026', type: 'text' },
  offerAcceptedDate:  { label: 'Date offer accepted', placeholder: 'e.g. 3 June 2026', type: 'text' },
  withdrawalReason:   { label: 'Reason for withdrawal', placeholder: 'e.g. Survey revealed subsidence', type: 'text' },
  counterOfferResponse: { label: 'Counter-offer response', placeholder: 'e.g. I can increase to £378,000 — my final position.', type: 'textarea' },
  surveyConcerns:     { label: 'Survey concerns to flag', placeholder: 'e.g. damp on north wall, cracked lintel above bay window', type: 'textarea' },
  surveyQuestions:    { label: 'Post-report questions', placeholder: 'What does amber on the bay window mean?', type: 'textarea' },
  surveyFindings:     { label: 'Survey findings (from report)', placeholder: 'e.g. Bay window lintel cracked (amber)', type: 'textarea' },
  surveyRemediationCost: { label: 'Estimated remediation cost (£)', placeholder: '8000', type: 'number' },
  surveyFee:          { label: 'Survey fee agreed (£)', placeholder: '450', type: 'number' },
  surveyDateOption1:  { label: 'Survey date option 1', placeholder: 'Monday 9 June', type: 'text' },
  surveyDateOption2:  { label: 'Survey date option 2', placeholder: 'Wednesday 11 June', type: 'text' },
  surveyTurnaround:   { label: 'Report turnaround (days)', placeholder: '5', type: 'number' },
  targetExchangeDate: { label: 'Target exchange date', placeholder: '2026-07-15', type: 'date' },
  targetCompletionDate: { label: 'Target completion date', placeholder: '2026-07-29', type: 'date' },
  removalsVolume:     { label: 'Volume description', placeholder: 'e.g. 3-bed house worth of furniture', type: 'text' },
  removalsRooms:      { label: 'Number of rooms', placeholder: '3', type: 'number' },
  removalsSpecialItems: { label: 'Large / specialist items', placeholder: 'e.g. Piano, wardrobe requiring disassembly', type: 'text' },
  removalsPackingReq: { label: 'Packing requirement', placeholder: 'e.g. Self-pack, transport only', type: 'text' },
  meterReadingGas:    { label: 'Gas meter reading', placeholder: '01234', type: 'text' },
  meterReadingElec:   { label: 'Electricity meter reading', placeholder: '56789', type: 'text' },
  meterReadingWater:  { label: 'Water meter reading', placeholder: '11111', type: 'text' },
  // Vendor-specific
  'vendor.streetName': { label: 'Street name', placeholder: 'Cottage Lane', type: 'text' },
  'vendor.areaName':   { label: 'Area name', placeholder: 'Sparsholt', type: 'text' },
};

// Context fields that come from UI inputs (not profile/finances/criteria).
const CTX_FIELD_KEYS = [
  'listing.address', 'listing.askingPrice', 'listing.offerAmount', 'listing.agreedPrice',
  'listing.portal', 'listing.ref', 'listing.tenure',
];

function buildBaseContext() {
  const ctx = assembleContext({ profile, criteria, finances });
  // Add aipAmount shortcut (some templates use finances.aipAmount directly).
  if (finances) {
    ctx.finances = ctx.finances || {};
    if (!ctx.finances.aipAmount && finances.mortgage?.targetMax) {
      ctx.finances.aipAmount = finances.mortgage.targetMax;
    }
    if (!ctx.finances.depositAmount && finances.goal?.targetDeposit) {
      ctx.finances.depositAmount = finances.goal.targetDeposit;
    }
    if (!ctx.finances.depositSource) {
      ctx.finances.depositSource = 'Cash ISA';
    }
  }
  return ctx;
}

function buildCurrentContext() {
  const base = buildBaseContext();

  // Contact picker value.
  const contactSel = $('ctx-contact');
  const contactNameInput = $('ctx-contact-name');
  const selectedContactVal = contactSel?.value;
  let contactData = {};
  if (selectedContactVal) {
    try { contactData = JSON.parse(selectedContactVal); } catch { /* ignore */ }
  }
  if (contactNameInput?.value) {
    // Determine the role from the template to set the right field.
    const role = activeTemplate?.recipientRole;
    const nameKey = {
      'estate-agent': 'agentName',
      'mortgage-broker': 'brokerName',
      'solicitor': 'solicitorName',
      'surveyor': 'surveyorName',
    }[role] || 'agentName';
    contactData[nameKey] = contactData[nameKey] || contactNameInput.value;
  }
  base.contact = { ...base.contact, ...contactData };

  // Listing fields from UI.
  const addr = $('ctx-address')?.value?.trim();
  const price = $('ctx-price')?.value;
  const offer = $('ctx-offer')?.value;
  const portal = $('ctx-portal')?.value?.trim();
  const ref = $('ctx-ref')?.value?.trim();
  const tenure = $('ctx-tenure')?.value;

  base.listing = base.listing || {};
  if (addr)   base.listing.address = addr;
  if (price)  { base.listing.askingPrice = price; base.listing.agreedPrice = price; }
  if (offer)  {
    base.listing.offerAmount = offer;
    if (price) base.listing.offerAsPctOfAsking = Math.round((Number(offer) / Number(price)) * 100);
  }
  if (portal) base.listing.portal = portal;
  if (ref)    base.listing.ref = ref;
  if (tenure) base.listing.tenure = tenure;

  // Extra fields.
  const extras = {};
  $('extra-fields')?.querySelectorAll('[data-extra-key]').forEach((inp) => {
    const key = inp.dataset.extraKey;
    const val = inp.value?.trim();
    if (val) {
      // Nested paths (vendor.streetName) go into base.vendor etc.
      if (key.includes('.')) {
        const [top, sub] = key.split('.');
        base[top] = base[top] || {};
        base[top][sub] = val;
      } else {
        extras[key] = val;
      }
    }
  });
  Object.assign(base, extras);

  return base;
}

function openDialog(tmpl) {
  activeTemplate = tmpl;
  const dialog = $('outreach-dialog');
  if (!dialog) return;

  // Title.
  $('dialog-title').textContent = tmpl.title;

  // Best-practice notes.
  const bpnList = $('bpn-list');
  bpnList.innerHTML = (tmpl.bestPracticeNotes || []).map((n) => `<li>${esc(n)}</li>`).join('');

  // Sources.
  const sourcesList = $('sources-list');
  sourcesList.innerHTML = (tmpl.sources || []).map((s) =>
    `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`
  ).join('');

  // Populate contact dropdown for this role.
  populateContactSelect(tmpl.recipientRole);

  // Show/hide context fields based on dataNeeded.
  updateContextFieldVisibility(tmpl);

  // Build extra fields for template-specific data.
  buildExtraFields(tmpl);

  // Attach preview trigger to all inputs.
  dialog.querySelectorAll('input, select, textarea').forEach((inp) => {
    inp.removeEventListener('input', updatePreview);
    inp.addEventListener('input', updatePreview);
    inp.removeEventListener('change', updatePreview);
    inp.addEventListener('change', updatePreview);
  });

  // Render initial preview.
  updatePreview();

  // Show dialog.
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

  // Extra keys = keys in dataNeeded that are NOT covered by profile/criteria/finances/contact/listing (base fields).
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
  if (!activeTemplate) return;

  const fullCtx = buildCurrentContext();
  const filtered = filterContextByDataNeeded(fullCtx, activeTemplate.dataNeeded);
  const { subject, body, missingFields } = renderTemplate(activeTemplate, filtered);

  // Update preview pane.
  const subjectEl = $('preview-subject-text');
  const bodyEl = $('preview-body-text');
  if (subjectEl) subjectEl.textContent = subject;
  if (bodyEl) bodyEl.textContent = body;

  // Attach hint.
  const attachHint = activeTemplate.attachmentsHint || [];
  const attachEl = $('preview-attach');
  const attachList = $('preview-attach-list');
  if (attachEl) attachEl.hidden = attachHint.length === 0;
  if (attachList) attachList.textContent = attachHint.join(', ');

  // Missing fields warning.
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

  // Store subject/body on the dialog for the action buttons.
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
    'estate-agent': contacts?.agents ?? [],
    'mortgage-broker': contacts?.brokers ?? [],
    'solicitor': contacts?.solicitors ?? [],
    'surveyor': contacts?.surveyors ?? [],
  };
  const list = roleMap[role] || [];
  for (const c of list) {
    const opt = document.createElement('option');
    const payload = { ...c };
    // Map to the right contact key for this role.
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

function bindDialog() {
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
  activeTemplate = null;
  _returnFocus?.focus();
}

async function autoSaveDrafted(status) {
  if (!activeTemplate) return;
  const dialog = $('outreach-dialog');
  const address = $('ctx-address')?.value?.trim() || '';
  const entry = {
    id: newEntryId(),
    templateId: activeTemplate.id,
    templateTitle: activeTemplate.title,
    recipientRole: activeTemplate.recipientRole,
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
  logEntries = await saveEntry(entry);
}

// ── Log ───────────────────────────────────────────────────────────────────
function renderLog() {
  const tbody = $('log-tbody');
  if (!tbody) return;

  if (!logEntries || logEntries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="log-empty">No emails drafted yet. Generate one above.</td></tr>`;
    return;
  }

  tbody.innerHTML = [...logEntries].reverse().map((e) => `
    <tr>
      <td class="num">${esc(e.createdAt ? e.createdAt.slice(0, 10) : '—')}</td>
      <td>${esc(e.templateId || '')} · ${esc(e.templateTitle || '')}</td>
      <td>${esc(ROLE_LABELS[e.recipientRole] || e.recipientRole || '—')}</td>
      <td class="addr">${esc(e.propertyAddress || '—')}</td>
      <td class="subject-cell">${esc(e.subject || '—')}</td>
      <td><span class="status-badge status-badge--${esc(e.status || 'drafted')}">${esc(e.status || 'drafted')}</span></td>
      <td>
        <div class="log-actions">
          <button type="button" onclick="markStatus('${esc(e.id)}','sent')" class="outline">Sent</button>
          <button type="button" onclick="markStatus('${esc(e.id)}','replied')" class="outline">Replied</button>
          <button type="button" onclick="markStatus('${esc(e.id)}','archived')" class="outline">Archive</button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.markStatus = async (id, status) => {
  logEntries = await saveEntry({ id, status, ...(status === 'sent' ? { sentAt: new Date().toISOString() } : {}), ...(status === 'replied' ? { repliedAt: new Date().toISOString() } : {}) });
  renderLog();
};

// ── Contacts ───────────────────────────────────────────────────────────────
const CONTACT_GROUPS = [
  { key: 'agents',     label: 'Estate agents',     role: 'estate-agent' },
  { key: 'brokers',    label: 'Mortgage brokers',  role: 'mortgage-broker' },
  { key: 'solicitors', label: 'Solicitors',         role: 'solicitor' },
  { key: 'surveyors',  label: 'Surveyors',          role: 'surveyor' },
];

function renderContacts() {
  const grid = $('contacts-grid');
  if (!grid) return;
  grid.innerHTML = CONTACT_GROUPS.map((g) => `
    <div class="contacts-group">
      <h3>${esc(g.label)}</h3>
      <ul class="contacts-list" id="clist-${esc(g.key)}">
        ${(contacts?.[g.key] ?? []).filter(Boolean).length === 0
          ? `<li class="contact-item__detail">None yet.</li>`
          : (contacts?.[g.key] ?? []).filter(Boolean).map((c, i) => `
            <li class="contact-item">
              <div>
                <div class="contact-item__name">${esc(c.name)}</div>
                <div class="contact-item__detail">${esc(c.email || '')}${c.phone ? ' · ' + esc(c.phone) : ''}${c.firm ? ' · ' + esc(c.firm) : ''}</div>
              </div>
              <div class="contact-item__actions">
                <button type="button" onclick="deleteContact('${esc(g.key)}',${i})" class="outline" aria-label="Delete ${esc(c.name)}">Remove</button>
              </div>
            </li>
          `).join('')}
      </ul>
      <form class="add-contact-form" onsubmit="addContact(event,'${esc(g.key)}')" aria-label="Add ${esc(g.label.slice(0, -1))}">
        <div class="form-row">
          <input type="text" name="name" placeholder="Name *" required aria-label="Name" />
          <input type="email" name="email" placeholder="Email" aria-label="Email" />
        </div>
        <div class="form-row">
          <input type="tel" name="phone" placeholder="Phone" aria-label="Phone" />
          ${g.key === 'solicitors' ? `<input type="text" name="firm" placeholder="Firm name" aria-label="Firm name" />` : ''}
        </div>
        <button type="submit" class="add-contact-btn outline">Add</button>
      </form>
    </div>
  `).join('');
}

window.addContact = async (e, groupKey) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const entry = {
    name:  fd.get('name')?.trim(),
    email: fd.get('email')?.trim(),
    phone: fd.get('phone')?.trim(),
    firm:  fd.get('firm')?.trim(),
  };
  if (!entry.name) return;
  contacts[groupKey] = [...(contacts[groupKey] || []), entry];
  await saveContacts(contacts);
  form.reset();
  renderContacts();
};

window.deleteContact = async (groupKey, idx) => {
  contacts[groupKey] = (contacts[groupKey] || []).filter((_, i) => i !== idx);
  await saveContacts(contacts);
  renderContacts();
};

// ── Toast ─────────────────────────────────────────────────────────────────
let _toastEl = null;
function showToast(msg, isError = false) {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.setAttribute('role', 'status');
    _toastEl.setAttribute('aria-live', 'polite');
    _toastEl.className = 'storage-toast'; // reuse storage.js's toast style
    Object.assign(_toastEl.style, {
      position: 'fixed',
      bottom: 'max(1rem, env(safe-area-inset-bottom))',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--ink)',
      color: 'var(--paper)',
      padding: '0.5rem 1.25rem',
      borderRadius: 'var(--rec-radius-sm)',
      fontFamily: 'var(--font-body)',
      fontSize: '0.875rem',
      zIndex: '9999',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.2s',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.style.background = isError ? 'oklch(42% 0.18 25)' : 'var(--ink)';
  _toastEl.style.opacity = '1';
  clearTimeout(_toastEl._t);
  _toastEl._t = setTimeout(() => { _toastEl.style.opacity = '0'; }, 3500);
}

// ── Start ──────────────────────────────────────────────────────────────────
document.addEventListener('shell:ready', init);
// Fallback if shell:ready already fired or not used.
if (document.readyState !== 'loading') {
  setTimeout(init, 0);
} else {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
}
