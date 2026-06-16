// rejected-view.js — the pure read model for the dedicated Rejected page.
// No DOM, no storage, no fetch (unit-tested in Node). It reduces the append-only
// reaction log to the set of properties whose CURRENT reaction is `pass` or
// `reject`, renders them from the durable per-reaction snapshot (so a passed /
// rejected home still shows after its live listings row is withdrawn or purged),
// collapses re-listed duplicates to the most-recent decision, and orders them
// most-recently-actioned first. Search (property type / area name) and 50-per-page
// pagination are pure helpers over that list.
import { latestPerListing } from './reactions.js';
import { dedupeNewestByFingerprint } from './suppress.js';

/** The reactions that belong on the Rejected page (everything bar `like`). */
const REJECTED_REACTIONS = new Set(['pass', 'reject']);

/**
 * Reduce the append-only reaction log to the rejected/passed rows for the table.
 * @param {Array} log  raw reaction rows ({ listing_id, reaction, reasons, created_at, listing_snapshot })
 * @param {object} [opts]
 * @param {(listing)=>string} [opts.areaNameOf]  map a snapshot to its area name (for search + the Area column)
 * @returns {Array<{ listing, reaction, reasons, created_at, areaName }>}
 *   most-recently-actioned first; re-listed same-property decisions collapse to one.
 */
export function buildRejectedRows(log, { areaNameOf = () => '' } = {}) {
  const latest = latestPerListing(log || []);
  const entries = [];
  for (const [, row] of latest) {
    if (!REJECTED_REACTIONS.has(row?.reaction)) continue;
    const listing = row.listing_snapshot;
    if (!listing || !listing.rightmove_id) continue; // no snapshot → nothing to render
    entries.push({
      listing,
      reaction: row.reaction,
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
      created_at: row.created_at,
      areaName: areaNameOf(listing) || '',
    });
  }
  // Collapse a property reacted to more than once under different ids (a re-list) to
  // the most-recently-actioned entry; coarse-address rows never falsely merge.
  const deduped = dedupeNewestByFingerprint(entries, (x) => x.listing, (x) => x.created_at);
  deduped.sort((a, b) => time(b.created_at) - time(a.created_at));
  return deduped;
}

/**
 * Filter the rows by a free-text query. Multi-token AND across property type, area
 * name, title, address and outcode — so "barn detached" or "fordingbridge flat"
 * both narrow as expected. Empty query returns the rows unchanged.
 */
export function searchRejected(rows, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return rows || [];
  const tokens = q.split(/\s+/);
  return (rows || []).filter((entry) => {
    const l = entry.listing || {};
    const hay = [l.property_type, entry.areaName, l.title, l.address, l.outcode]
      .map((s) => String(s ?? '').toLowerCase()).join(' ');
    return tokens.every((t) => hay.includes(t));
  });
}

/**
 * Slice `rows` into a single page. `page` is 1-based and clamped into range, so a
 * search that shrinks the result set can never strand the view on an empty page.
 * @returns {{ slice, page, pageCount, total, perPage, start }}
 */
export function paginate(rows, page = 1, perPage = 50) {
  const all = Array.isArray(rows) ? rows : [];
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const clamped = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (clamped - 1) * perPage;
  return { slice: all.slice(start, start + perPage), page: clamped, pageCount, total, perPage, start };
}

function time(v) {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}
