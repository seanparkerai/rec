// ask/messages.js — the "Messages" surface folded into Ask: the outreach LOG
// (drafted / sent / replied messages) and the CONTACTS directory, both real
// user-state. Reads/writes straight through the storage layer (CLAUDE.md §16/§18 —
// extend-only, never bypassed); replaces the retired outreach grid's log + contacts
// panels. Drafting itself now lives in the Compose launcher (ask/compose.js).
import {
  getOutreachLog, getContacts, saveContacts,
} from '../storage.js';
import { saveEntry } from '../outreach-store.js';

const ROLE_LABELS = {
  'estate-agent': 'Estate agent', 'mortgage-broker': 'Mortgage broker',
  'solicitor': 'Solicitor', 'surveyor': 'Surveyor', 'vendor': 'Vendor',
  'local-authority': 'Local authority', 'removals': 'Removals', 'insurance': 'Insurance',
};

const CONTACT_GROUPS = [
  { key: 'agents', label: 'Estate agents' },
  { key: 'brokers', label: 'Mortgage brokers' },
  { key: 'solicitors', label: 'Solicitors' },
  { key: 'surveyors', label: 'Surveyors' },
];

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Wire the Messages dialog.
 * @param {object} refs   { dialog, logEl, contactsEl, openButtons[], closeBtn }
 */
export function createMessages({ dialog, logEl, contactsEl, openButtons = [], closeBtn }) {
  let log = [];
  let contacts = null;

  async function load() {
    try { log = await getOutreachLog() ?? []; } catch { log = []; }
    try { contacts = await getContacts(); } catch { contacts = null; }
    renderLog();
    renderContacts();
  }

  function renderLog() {
    if (!logEl) return;
    if (!log.length) {
      logEl.innerHTML = '<p class="ask-messages__empty">No messages yet. Use “Draft a message” to write your first one.</p>';
      return;
    }
    logEl.innerHTML = [...log].reverse().map((e) => `
      <li class="ask-messages__item">
        <div class="ask-messages__meta">
          <span class="ask-messages__role">${esc(ROLE_LABELS[e.recipientRole] || e.recipientRole || '—')}</span>
          <span class="status-badge status-badge--${esc(e.status || 'drafted')}">${esc(e.status || 'drafted')}</span>
        </div>
        <p class="ask-messages__subject">${esc(e.subject || '—')}</p>
        ${e.propertyAddress ? `<p class="ask-messages__addr">${esc(e.propertyAddress)}</p>` : ''}
        <div class="ask-messages__actions" role="group" aria-label="Update status">
          <button type="button" class="ask-draft__btn" data-id="${esc(e.id)}" data-status="sent">Sent</button>
          <button type="button" class="ask-draft__btn" data-id="${esc(e.id)}" data-status="replied">Replied</button>
          <button type="button" class="ask-draft__btn" data-id="${esc(e.id)}" data-status="archived">Archive</button>
        </div>
      </li>`).join('');
  }

  logEl?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-status]');
    if (!btn) return;
    const id = btn.dataset.id;
    const status = btn.dataset.status;
    btn.disabled = true;
    log = await saveEntry({
      id, status,
      ...(status === 'sent' ? { sentAt: new Date().toISOString() } : {}),
      ...(status === 'replied' ? { repliedAt: new Date().toISOString() } : {}),
    });
    renderLog();
  });

  function renderContacts() {
    if (!contactsEl) return;
    const c = contacts || { agents: [], brokers: [], solicitors: [], surveyors: [] };
    contactsEl.innerHTML = CONTACT_GROUPS.map((g) => {
      const list = Array.isArray(c[g.key]) ? c[g.key] : [];
      const rows = list.length
        ? list.map((p, i) => `
            <li class="ask-messages__contact">
              <span><strong>${esc(p.name || '—')}</strong>${p.firm ? ` · ${esc(p.firm)}` : ''}${p.email ? `<br>${esc(p.email)}` : ''}${p.phone ? ` · ${esc(p.phone)}` : ''}</span>
              <button type="button" class="ask-draft__btn" data-group="${g.key}" data-index="${i}" aria-label="Remove ${esc(p.name || 'contact')}">Remove</button>
            </li>`).join('')
        : '<li class="ask-messages__empty">None yet.</li>';
      return `
        <section class="ask-messages__group">
          <h4 class="ask-messages__grouphead">${esc(g.label)}</h4>
          <ul class="ask-messages__list">${rows}</ul>
          <form class="ask-messages__add" data-group="${g.key}">
            <input type="text" name="name" placeholder="Name" class="ask-compose__input" required aria-label="${esc(g.label)} name" />
            <input type="email" name="email" placeholder="Email" class="ask-compose__input" aria-label="${esc(g.label)} email" />
            <input type="tel" name="phone" placeholder="Phone" class="ask-compose__input" aria-label="${esc(g.label)} phone" />
            <button type="submit" class="ask-draft__btn">Add</button>
          </form>
        </section>`;
    }).join('');
  }

  contactsEl?.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('.ask-messages__add');
    if (!form) return;
    ev.preventDefault();
    const group = form.dataset.group;
    const name = form.name.value.trim();
    if (!name) return;
    contacts = contacts || { agents: [], brokers: [], solicitors: [], surveyors: [] };
    if (!Array.isArray(contacts[group])) contacts[group] = [];
    contacts[group].push({ name, email: form.email.value.trim(), phone: form.phone.value.trim() });
    await saveContacts(contacts);
    renderContacts();
  });

  contactsEl?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-group][data-index]');
    if (!btn) return;
    const group = btn.dataset.group;
    const index = Number(btn.dataset.index);
    if (!contacts || !Array.isArray(contacts[group])) return;
    contacts[group].splice(index, 1);
    await saveContacts(contacts);
    renderContacts();
  });

  function open() {
    load();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function close() { if (dialog.open) dialog.close(); }

  openButtons.forEach((b) => b?.addEventListener('click', open));
  closeBtn?.addEventListener('click', close);

  return { open };
}
