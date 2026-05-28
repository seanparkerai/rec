// outreach-store.js — outreach-specific storage helpers.
// Wraps the approved exports from storage.js; never calls Supabase directly.
import { getContacts, saveContacts, getOutreachLog, saveOutreachLog } from './storage.js';

export { getContacts, saveContacts };

/**
 * Retrieve the outreach log array.
 * Each entry: { id, templateId, recipientRole, contactName, propertyAddress,
 *               subject, body, status, sentAt, repliedAt, notes }
 * Status enum: 'drafted' | 'sent' | 'replied' | 'declined' | 'archived'
 */
export async function getLog() {
  return (await getOutreachLog()) ?? [];
}

/**
 * Upsert a log entry by entry.id. Merges with any existing entry.
 */
export async function saveEntry(entry) {
  const log = await getLog();
  const idx = log.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    log[idx] = { ...log[idx], ...entry };
  } else {
    log.push(entry);
  }
  await saveOutreachLog(log);
  return log;
}

/**
 * Generate a unique entry ID.
 */
export function newEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
