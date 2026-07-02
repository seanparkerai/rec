// areas/matched-price.js — THE one home for the matched-price lookup (Phase 6.1).
// Pure, no DOM/Supabase. Given an area and the household's criteria, pick the most
// relevant average price for the affordability verdict: the user's preferred property
// type if a price exists for it, else fall back through the cheapest-available order
// (so the verdict tends toward "best case" — recorded decision, plan/03-checklist 6.1:
// changing this bias changes visible verdicts and is §3.10b owner-gated).
//
// Previously triplicated in page-areas.js / page-area-detail/sections.js / page-map.js;
// the price source is the union of those copies: `priceSummary` (index-shaped areas)
// falling back to `prices` (detail-shaped areas carry the full block — the summary is
// baked from it, so for index rows the fallback is a no-op).

const PROP_TO_KEY = {
  Detached: 'avgDetached',
  Bungalow: 'avgDetached', // bungalows priced like detacheds in the dataset
  'Semi-detached': 'avgSemi',
  Terraced: 'avgTerraced',
  'Flat / Apartment': 'avgFlat',
};

// Cheapest-available fallback order (labels are the short display forms).
const FALLBACK = [
  ['avgSemi', 'Semi'],
  ['avgTerraced', 'Terraced'],
  ['avgDetached', 'Detached'],
  ['avgFlat', 'Flat'],
];

export function matchedPrice(area, criteria) {
  const ps = area?.priceSummary || area?.prices || null;
  if (!ps) return { price: null, label: null };
  const preferred = criteria?.propertyTypePrefs?.preferred || [];
  for (const t of preferred) {
    const k = PROP_TO_KEY[t];
    if (k && ps[k] != null) return { price: ps[k], label: t };
  }
  for (const [k, label] of FALLBACK) {
    if (ps[k] != null) return { price: ps[k], label };
  }
  return { price: null, label: null };
}
