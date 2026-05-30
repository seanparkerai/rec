// page-listings.js — v3 Live Listings page coordinator (L1 + L2).
// Loads fetcher-written listings, scores each with the listing-fit engine
// (5-band verdict + affordability hard gate + explainable contributions),
// and renders a fit-ranked feed with the "why" for every verdict. L3 adds
// per-row reaction capture (like/pass/reject + reject reason chips, append-only)
// and a personal-status select on the shortlist record. Learned preferences
// (using these reactions) arrive in L4.
import {
  getListings, getCriteria, getFinances, getAreas,
  getListingReactions, saveListingReaction,
  getShortlistStatuses, setShortlistStatus,
} from './storage.js';
import { deriveFinances } from './finance-derive.js';
import { scoreListingFit } from './listing-fit.js';
import { REACTIONS, REJECT_REASONS, PERSONAL_STATUSES } from './listing-reactions.js';
import { el, clear } from './dom.js';

const REACTION_LABELS = { like: 'Like', pass: 'Pass', reject: 'Reject' };
const PERSONAL_STATUS_LABELS = {
  new: 'New', saved: 'Saved', viewed: 'Viewed', offered: 'Offered', rejected: 'Rejected',
};

const VERDICT_LABELS = {
  strong: 'Strong match',
  possible: 'Possible match',
  stretch: 'Stretch',
  weak: 'Weak match',
  reject: 'Reject',
  unknown: 'Unscored',
};

const STATUS_LABELS = {
  live: 'For sale',
  under_offer: 'Under offer',
  sstc: 'Sold STC',
  withdrawn: 'Withdrawn',
};

function fmtPrice(n) {
  if (n == null) return '—';
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function fmtAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function lastPriceDrop(listing) {
  const h = Array.isArray(listing.price_history) ? listing.price_history : [];
  if (h.length < 2) return null;
  const prev = h[h.length - 2]?.price, now = h[h.length - 1]?.price;
  if (prev != null && now != null && now < prev) return prev - now;
  return null;
}

function buildWhy(scored) {
  const items = (scored.contributions || [])
    .slice()
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .map((c) => {
      const sign = c.delta > 0 ? '＋' : '－';
      return el('li', { class: `listing-why__item listing-why__item--${c.delta > 0 ? 'pos' : 'neg'}` }, [
        el('span', { class: 'listing-why__sign', 'aria-hidden': 'true' }, sign),
        el('span', { class: 'listing-why__label' }, c.label),
      ]);
    });
  if (!items.length) items.push(el('li', { class: 'listing-why__item' }, 'No distinguishing signals — neutral fit.'));
  return el('details', { class: 'listing-why' }, [
    el('summary', {}, 'Why this verdict'),
    el('ul', { class: 'listing-why__list' }, items),
  ]);
}

// Reaction controls: one-tap like/pass/reject, with reason chips revealed on
// reject. Reactions are append-only (L3) — each tap logs a row; the latest wins.
function buildReactions(listing, current, onReact) {
  const btns = REACTIONS.map((rx) =>
    el('button', {
      type: 'button', class: 'listing-react__btn', 'data-react': rx,
      'aria-pressed': String(current?.reaction === rx),
    }, REACTION_LABELS[rx]));

  const chips = REJECT_REASONS.map((r) =>
    el('button', {
      type: 'button', class: 'listing-chip', 'data-reason': r.key,
      'aria-pressed': String(current?.reaction === 'reject' && current?.reason === r.key),
    }, r.label));

  const reasonsRow = el('div', { class: 'listing-reasons', role: 'group', 'aria-label': 'Why reject?' }, chips);
  reasonsRow.hidden = current?.reaction !== 'reject';

  const group = el('div', { class: 'listing-react', role: 'group', 'aria-label': 'Your reaction' }, btns);
  const setPressed = (rx) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.react === rx)));

  group.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-react]');
    if (!btn) return;
    const rx = btn.dataset.react;
    setPressed(rx);
    reasonsRow.hidden = rx !== 'reject';
    // Log the reaction immediately; a reject's reason is an optional refinement.
    await onReact(rx, null);
  });

  reasonsRow.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-reason]');
    if (!chip) return;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    setPressed('reject');
    await onReact('reject', chip.dataset.reason);
  });

  return el('div', { class: 'listing-react-wrap' }, [group, reasonsRow]);
}

// Personal-status select (lives on the shortlist record, not a parallel machine).
function buildStatus(listing, current, onStatus) {
  const sel = el('select', { class: 'listing-status', 'aria-label': 'Personal status' }, [
    el('option', { value: '' }, 'No status'),
    ...PERSONAL_STATUSES.map((s) => el('option', { value: s, selected: current === s }, PERSONAL_STATUS_LABELS[s])),
  ]);
  sel.addEventListener('change', () => onStatus(sel.value || null));
  return el('label', { class: 'listing-status-wrap' }, [
    el('span', { class: 'listing-status__label' }, 'Status'),
    sel,
  ]);
}

function buildRow(listing, idx, scored, area, ctx = {}) {
  const verdict = scored?.verdict || 'unknown';
  const dot = el('span', { class: `fit-dot fit-dot--${verdict}`, 'aria-hidden': 'true' });

  const title = el('p', { class: 'area-name' }, listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`);

  const placeBits = [];
  if (listing.address) placeBits.push(listing.address);
  else if (area?.name) placeBits.push(area.name);
  if (listing.outcode) placeBits.push(listing.outcode);
  const place = el('p', { class: 'area-place' }, placeBits.join(' · '));

  const tags = [];
  if (listing.status && listing.status !== 'live') {
    tags.push(el('span', { class: `listing-tag listing-tag--${listing.status}` }, STATUS_LABELS[listing.status] || listing.status));
  }
  const drop = lastPriceDrop(listing);
  if (drop) tags.push(el('span', { class: 'listing-tag listing-tag--drop' }, `↓ ${fmtPrice(drop)}`));
  if (listing.update_reason === 'new') tags.push(el('span', { class: 'listing-tag listing-tag--new' }, 'New'));
  const tagRow = tags.length ? el('div', { class: 'listing-tags' }, tags) : null;

  const controls = ctx.onReact
    ? el('div', { class: 'listing-controls' }, [
        buildReactions(listing, ctx.reaction, (rx, reason) => ctx.onReact(listing, rx, reason)),
        buildStatus(listing, ctx.status, (status) => ctx.onStatus(listing, status)),
      ])
    : null;

  const main = el('div', { class: 'area-row__main' }, [title, place, tagRow, buildWhy(scored), controls].filter(Boolean));

  const price = el('span', { class: 'bed-fit' }, [
    el('span', { class: `bed-fit-type verdict verdict--${verdict}` }, VERDICT_LABELS[verdict]),
    el('span', { class: 'num' }, fmtPrice(listing.price)),
  ]);

  const meta = el('span', { class: 'listing-meta' }, [
    el('span', { class: 'listing-meta__beds num' }, listing.beds != null ? `${listing.beds} bed` : '—'),
    el('span', { class: 'listing-meta__age' }, fmtAgo(listing.added_date || listing.first_seen)),
  ]);

  const open = listing.url
    ? el('a', { class: 'listing-open', href: listing.url, target: '_blank', rel: 'noopener', 'aria-label': 'Open on Rightmove' }, '↗')
    : el('span', { class: 'listing-open listing-open--none' }, '');

  return el('li', { class: 'area-row listing-row', 'data-id': listing.rightmove_id }, [
    el('span', { class: 'area-index num' }, String(idx + 1).padStart(3, '0')),
    dot, main, price, meta, open,
  ]);
}

function buildSummary(shown, total, gatedCount) {
  const bits = [`${shown} listing${shown === 1 ? '' : 's'} shown`];
  if (gatedCount) bits.push(`${gatedCount} out of reach (hidden)`);
  if (total !== shown + gatedCount) bits.push(`${total} fetched`);
  return el('p', { class: 'listings-summary' }, bits.join(' · '));
}

async function render() {
  const main = document.querySelector('#main') || document.body;
  const listEl = main.querySelector('[data-listings]') || main.querySelector('.area-list');
  const summaryEl = main.querySelector('[data-listings-summary]');
  const showOOR = main.querySelector('[data-show-oor]');
  if (!listEl) return;

  const [listings, criteria, rawFinances, areas, reactions, statuses] = await Promise.all([
    getListings({ limit: 200 }), getCriteria(), getFinances(), getAreas(),
    getListingReactions(), getShortlistStatuses(),
  ]);
  const finances = rawFinances ? deriveFinances(rawFinances) : null;
  const areasById = new Map((areas || []).map((a) => [a.id, a]));

  // Capture a compact snapshot of the listing at reaction time so the training
  // signal survives the live row being withdrawn/deleted (L3 durability).
  const snapshotOf = (l) => ({
    rightmove_id: l.rightmove_id, title: l.title, address: l.address, outcode: l.outcode,
    area_id: l.area_id, price: l.price, beds: l.beds, baths: l.baths,
    property_type: l.property_type, status: l.status, url: l.url,
  });
  const onReact = async (listing, reaction, reason) => {
    const ok = await saveListingReaction({
      listing_id: listing.rightmove_id, reaction, reason, listing_snapshot: snapshotOf(listing),
    });
    if (ok) reactions[listing.rightmove_id] = { reaction, reason: reason ?? null, created_at: new Date().toISOString() };
  };
  const onStatus = async (listing, status) => {
    const ok = await setShortlistStatus(listing.rightmove_id, status);
    if (ok) { if (status) statuses[listing.rightmove_id] = status; else delete statuses[listing.rightmove_id]; }
  };

  function paint() {
    clear(listEl);
    const includeOOR = !!(showOOR && showOOR.checked);

    if (!listings.length) {
      listEl.appendChild(el('li', { class: 'listings-empty' }, [
        el('p', {}, 'No listings yet.'),
        el('p', { class: 'listings-empty__hint' }, 'The daily fetch (fetch-listings workflow) hasn’t populated the listings table yet — run it from the Actions tab, or check the Apify / Supabase secrets are set.'),
      ]));
      if (summaryEl) { clear(summaryEl); }
      return;
    }

    const scoredRows = listings.map((listing) => {
      const area = listing.area_id ? areasById.get(listing.area_id) : null;
      const scored = finances
        ? scoreListingFit({ listing, finances, criteria, area })
        : { verdict: 'unknown', score: 0, gated: false, contributions: [] };
      return { listing, scored, area };
    });

    const gated = scoredRows.filter((r) => r.scored.gated);
    let visible = includeOOR ? scoredRows : scoredRows.filter((r) => !r.scored.gated);
    visible.sort((a, b) =>
      (b.scored.score - a.scored.score) ||
      (new Date(b.listing.first_seen) - new Date(a.listing.first_seen)));

    visible.forEach((r, i) => listEl.appendChild(buildRow(r.listing, i, r.scored, r.area, {
      reaction: reactions[r.listing.rightmove_id] || null,
      status: statuses[r.listing.rightmove_id] || '',
      onReact, onStatus,
    })));

    if (summaryEl) { clear(summaryEl); summaryEl.appendChild(buildSummary(visible.length, listings.length, includeOOR ? 0 : gated.length)); }
  }

  if (showOOR) showOOR.addEventListener('change', paint);
  paint();
}

render();
