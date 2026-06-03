// criteria/form.js — pure view-string builders + a form binding helper for the
// Criteria page (REFACTOR P7e). Extracted from page-criteria.js so they're
// unit-testable. No DOM/IO: esc is a pure string escaper; the builders return HTML
// strings and setNestedValue mutates a plain object.
import { esc } from '../dom.js';

export const gbp = (n) => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
}).format(n || 0);

export function listView(arr) {
  if (!arr?.length) return '<p class="muted mb-0">None.</p>';
  return `<ul class="mini-list">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

export function listEdit(arr, fieldId) {
  const items = (arr || []).map((x, i) => `
    <li class="edit-row">
      <span>${esc(x)}</span>
      <button type="button" class="outline secondary chip-x" data-remove="${fieldId}" data-index="${i}" aria-label="Remove">×</button>
    </li>
  `).join('');
  return `
    <ul class="edit-list" id="list-${fieldId}">${items}</ul>
    <div class="row add-row">
      <input type="text" id="add-${fieldId}" placeholder="Add…" />
      <button type="button" data-add="${fieldId}">Add</button>
    </div>
  `;
}

export function fieldView(label, value, type = 'text') {
  let display = value;
  if (type === 'currency' && typeof value === 'number') display = gbp(value);
  return `<div class="field-view"><dt>${esc(label)}</dt><dd>${display ? esc(String(display)) : '<span class="muted">—</span>'}</dd></div>`;
}

export function fieldEdit(label, name, value, type = 'text') {
  const id = `f-${name}`;
  const input = type === 'textarea'
    ? `<textarea id="${id}" name="${name}" rows="3">${esc(value)}</textarea>`
    : `<input type="${type}" id="${id}" name="${name}" value="${esc(value)}" />`;
  return `<div class="field-edit"><label for="${id}">${esc(label)}</label>${input}</div>`;
}

// Set a value at a dotted path on a plain object (mutates in place).
export function setNestedValue(obj, path, val) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = val;
}
