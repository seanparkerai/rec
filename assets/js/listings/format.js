// listings/format.js — pure presentation/computation helpers for the listings feed
// (REFACTOR P7b). Extracted from page-listings.js so they're unit-testable without a
// DOM. No DOM, no network, no storage.

// "£1,234,000" — rounded, en-GB grouped; em dash for null/undefined.
export function fmtPrice(n) {
  if (n == null) return '—';
  return '£' + Math.round(n).toLocaleString('en-GB');
}

// Compact "time ago" for a listing's added/updated date.
export function fmtAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// The magnitude of the most recent price reduction, or null if the last move
// wasn't a drop (or there's < 2 points of price history).
export function lastPriceDrop(listing) {
  const h = Array.isArray(listing.price_history) ? listing.price_history : [];
  if (h.length < 2) return null;
  const prev = h[h.length - 2]?.price, now = h[h.length - 1]?.price;
  if (prev != null && now != null && now < prev) return prev - now;
  return null;
}

// Absolute en-GB date, e.g. "5 Jun 2026" (extracted from page-property.js, P7f).
// Empty string for falsy or unparseable input.
export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// One membership area → "Waltham Chase — 0.3 mi (primary)". The primary is the
// listing's single stamped area_id; the others are every area whose geofence also
// contains the listing (the m2m membership). Pure.
export function fmtAreaMembershipItem(a) {
  if (!a) return '';
  const name = a.name || a.area_id || 'area';
  const dist = a.distance_mi != null && Number.isFinite(Number(a.distance_mi))
    ? `${Number(a.distance_mi).toFixed(1)} mi` : null;
  return `${name}${dist ? ` — ${dist}` : ''}${a.is_primary ? ' (primary)' : ''}`;
}

// The full "within range of" list for a listing's m2m area membership, nearest
// first — this is the "why is this showing for me" explanation. Returns '' when
// there is no membership to show. Pure (no DOM).
export function fmtAreaMembership(areas) {
  if (!Array.isArray(areas) || !areas.length) return '';
  return areas
    .slice()
    .sort((a, b) => (a?.distance_mi ?? Infinity) - (b?.distance_mi ?? Infinity))
    .map(fmtAreaMembershipItem)
    .join(' · ');
}
