// outreach/log.js — renders an outreach activity log table and binds status-update buttons (sent/replied/archived). DOM rendering and event handlers.

import { saveEntry } from '../outreach-store.js';
import { esc, byId as $ } from '../dom.js';
import { state, ROLE_LABELS } from './state.js';

export function renderLog() {
  const tbody = $('log-tbody');
  if (!tbody) return;

  if (!state.logEntries || state.logEntries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="log-empty">No emails drafted yet. Generate one above.</td></tr>`;
    return;
  }

  tbody.innerHTML = [...state.logEntries].reverse().map((e) => `
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
  state.logEntries = await saveEntry({ id, status, ...(status === 'sent' ? { sentAt: new Date().toISOString() } : {}), ...(status === 'replied' ? { repliedAt: new Date().toISOString() } : {}) });
  renderLog();
};
