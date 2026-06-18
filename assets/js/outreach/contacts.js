// outreach/contacts.js — renders and manages a grouped contact list (agents, brokers, solicitors, surveyors) with add/delete forms. DOM mutations.

import { saveContacts } from '../outreach-store.js';
import { esc, byId as $ } from '../dom.js';
import { state } from './state.js';

const CONTACT_GROUPS = [
  { key: 'agents',     label: 'Estate agents',    role: 'estate-agent' },
  { key: 'brokers',    label: 'Mortgage brokers', role: 'mortgage-broker' },
  { key: 'solicitors', label: 'Solicitors',        role: 'solicitor' },
  { key: 'surveyors',  label: 'Surveyors',         role: 'surveyor' },
];

export function renderContacts() {
  const grid = $('contacts-grid');
  if (!grid) return;
  grid.innerHTML = CONTACT_GROUPS.map((g) => `
    <div class="contacts-group">
      <h3>${esc(g.label)}</h3>
      <ul class="contacts-list" id="clist-${esc(g.key)}">
        ${(state.contacts?.[g.key] ?? []).filter(Boolean).length === 0
          ? `<li class="contact-item__detail">None yet.</li>`
          : (state.contacts?.[g.key] ?? []).filter(Boolean).map((c, i) => `
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
  state.contacts[groupKey] = [...(state.contacts[groupKey] || []), entry];
  await saveContacts(state.contacts);
  form.reset();
  renderContacts();
};

window.deleteContact = async (groupKey, idx) => {
  state.contacts[groupKey] = (state.contacts[groupKey] || []).filter((_, i) => i !== idx);
  await saveContacts(state.contacts);
  renderContacts();
};
