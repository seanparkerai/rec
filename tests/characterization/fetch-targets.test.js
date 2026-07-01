// Golden-master (step 2.3): the fetcher's COMPOSED target-building pipeline —
// radius tuning → demand gating → cluster targets → dedupe — over a fixture
// universe, exactly as tools/fetch-listings.mjs main() composes it. The
// shared-loader migration (2.4–2.5) must reproduce this output byte-for-byte.
import {
  applyRadiusTuning, demandFilterOutcodeMap, buildSearchTargets, dedupeSearchTargets,
} from '../../tools/fetch-listings.mjs';

const V = (id, oc, lat, lng, extra = {}) => ({
  id, outcode: oc, lat, lng, searchRadiusMi: 3, geofenceRadiusKm: 4.8, ...extra,
});
const tight = (pid) => ({ rightmove: { locationIdentifier: pid, identifierQuality: 'tight' } });
const coarse = () => ({ rightmove: { locationIdentifier: 'OUTCODE^9', identifierQuality: 'coarse' } });

function fixtureUniverse() {
  // SP11: fully tight (two near villages + one far) → tight cluster disks.
  // SO32: one coarse village → whole-outcode fallback search.
  // GU32/GU33: two villages sharing ONE tight identifier → dedupe merge.
  // PO15: origin-only area → demand-gated out entirely.
  return new Map([
    ['SP11', [
      V('wherwell-sp11', 'SP11', 51.10, -1.50, tight('POSTCODE^1')),
      V('goodworth-sp11', 'SP11', 51.105, -1.50, tight('POSTCODE^2')),
      V('hatherden-sp11', 'SP11', 51.40, -1.10, tight('POSTCODE^3')),
    ]],
    ['SO32', [
      V('waltham-chase-so32', 'SO32', 50.96, -1.20, tight('POSTCODE^4')),
      V('dundridge-so32', 'SO32', 50.94, -1.19, coarse()),
    ]],
    ['GU32', [V('flexcombe-gu32', 'GU32', 51.00, -0.93, tight('POSTCODE^5'))]],
    ['GU33', [V('flexcombe-gu33', 'GU33', 51.001, -0.931, tight('POSTCODE^5'))]],
    ['PO15', [V('whiteley-po15', 'PO15', 50.88, -1.25, tight('POSTCODE^6'))]],
  ]);
}

// Demand set as main() builds it: every area ≥1 active household links,
// with is_origin links dropped before the set is formed (whiteley excluded).
const DEMAND = new Set([
  'wherwell-sp11', 'goodworth-sp11', 'hatherden-sp11',
  'waltham-chase-so32', 'dundridge-so32', 'flexcombe-gu32', 'flexcombe-gu33',
]);

function composeTargets({ tuning = new Map(), now = new Date('2026-07-01T00:00:00Z') } = {}) {
  const outcodeMap = fixtureUniverse();
  const flat = [...outcodeMap.values()].flat();
  applyRadiusTuning(flat, tuning, now);
  const gated = demandFilterOutcodeMap(outcodeMap, DEMAND);
  return dedupeSearchTargets(buildSearchTargets(gated, 'cluster'));
}

const shape = (targets) => targets.map((t) => ({
  label: t.label,
  id: t.locationIdentifier,
  r: t.radiusMiles == null ? null : Number(t.radiusMiles.toFixed(3)),
  areas: (t.areas || []).map((a) => a.id).sort(),
}));

export async function register({ test, assert, assertEqual }) {
  test('targets golden-master: composed pipeline output (cluster mode, no tuning)', () => {
    const got = shape(composeTargets());
    const want = [
      // SP11 fully tight → greedy set-cover: near pair in one disk, far village its own.
      { label: 'SP11:wherwell-sp11+1', id: 'POSTCODE^1', r: 3.345, areas: ['goodworth-sp11', 'wherwell-sp11'] },
      { label: 'SP11:hatherden-sp11+0', id: 'POSTCODE^3', r: 3, areas: ['hatherden-sp11'] },
      // SO32 has a coarse member → ONE whole-outcode search (never double-billed).
      { label: 'SO32', id: null, r: null, areas: ['dundridge-so32', 'waltham-chase-so32'] },
      // GU32+GU33 share one tight identifier → merged, union of areas, widest radius.
      { label: 'GU32:flexcombe-gu32+0=GU33:flexcombe-gu33+0', id: 'POSTCODE^5', r: 3, areas: ['flexcombe-gu32', 'flexcombe-gu33'] },
      // PO15 (origin-only) is absent entirely — no target, no spend.
    ];
    assertEqual(JSON.stringify(got, null, 1), JSON.stringify(want, null, 1));
  });

  test('targets golden-master: learned tuning reshapes the same universe deterministically', () => {
    const tuning = new Map([
      // hatherden: learned tighter search radius
      ['hatherden-sp11', { search_radius_mi: 1.5, geofence_radius_mi: 1.5, geofence_radii: null, explore_until: null, override_radius_mi: null }],
      // wherwell: inside an exploration window → widened to the ceiling
      ['wherwell-sp11', { search_radius_mi: 2, geofence_radius_mi: 2, geofence_radii: null, explore_until: '2026-12-01T00:00:00Z', override_radius_mi: null }],
    ]);
    const got = shape(composeTargets({ tuning }));
    const hath = got.find((t) => t.areas.includes('hatherden-sp11'));
    assertEqual(hath.r, 1.5, 'learned radius drives the lone-village disk');
    const wher = got.find((t) => t.areas.includes('wherwell-sp11'));
    assert(wher.r > 3.3, `exploration widens the wherwell cluster (got ${wher.r})`);
    // Determinism: identical inputs → identical serialized output.
    assertEqual(JSON.stringify(got), JSON.stringify(shape(composeTargets({ tuning }))));
  });

  test('targets: cluster mode never issues more searches than outcode mode (cost invariant)', () => {
    const outcodeMap = demandFilterOutcodeMap(fixtureUniverse(), DEMAND);
    const clusterN = dedupeSearchTargets(buildSearchTargets(outcodeMap, 'cluster')).length;
    const outcodeN = dedupeSearchTargets(buildSearchTargets(outcodeMap, 'outcode')).length;
    assert(clusterN <= outcodeN, `cluster (${clusterN}) ≤ outcode (${outcodeN})`);
  });

  test('targets: demand gating removes whole outcodes and partial villages', () => {
    const partial = new Set(['waltham-chase-so32']); // dundridge unlinked
    const gated = demandFilterOutcodeMap(fixtureUniverse(), partial);
    assertEqual([...gated.keys()].join(','), 'SO32', 'only the demanded outcode survives');
    assertEqual(gated.get('SO32').map((v) => v.id).join(','), 'waltham-chase-so32', 'undemanded village pruned within the outcode');
  });
}
