// page-rejected/row.js — pure view-builder for one rejected/passed row: a thin
// composition of THE shared property-card family in its compact register (step
// 3.4d — the old table's density, now the same design as Browse and Saved).
// Renders from the durable reaction snapshot; no page state, no storage.
import { url } from '../config.js';
import { buildPropertyCard } from '../listings/property-card.js';

const dossierHref = (id) => `${url('pages/property.html')}?id=${encodeURIComponent(id)}&from=rejected`;

const fmtDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * One archive row. `entry` is a buildRejectedRows() item:
 * { listing (snapshot), reaction ('pass'|'reject'), reasons, created_at, areaName }.
 */
export function buildRejectedCard(entry) {
  const l = entry.listing;
  const when = fmtDate(entry.created_at);
  const card = buildPropertyCard(l, {
    href: dossierHref(l.rightmove_id),
    areaName: entry.areaName || '',
    badge: entry.reaction === 'reject'
      ? { label: 'Rejected', tone: 'reject' }
      : { label: 'Passed', tone: 'neutral' },
    metaExtra: when ? `Actioned ${when}` : '',
    compact: true,
  });
  card.setAttribute('role', 'listitem');
  return card;
}
