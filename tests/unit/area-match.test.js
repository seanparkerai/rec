// tests/area-match.test.js — Phase 2 pure-logic tests for the per-household area
// lookup: stub-id slugging, haversine distance, and the catalog match-or-create
// decision. No network, no Supabase — the live postcodes.io round-trip is exercised
// in the browser (areas/place-lookup.js). Node-only; wired into the tiered harness (tools/run-all-tests.mjs).
import { slugifyArea, haversineKm, postcodeDistrict, matchCatalogArea } from '../../assets/js/areas/area-match.js';

export async function register({ test, assert, assertEqual }) {
  // ── slugifyArea ────────────────────────────────────────────────────────────
  test('area-match/slug: name+county → schema-valid id, never colliding with curated', () => {
    assertEqual(slugifyArea('West Meon', 'Hampshire'), 'west-meon-hampshire');
    assertEqual(slugifyArea("St Mary Bourne", 'Hampshire'), 'st-mary-bourne-hampshire');
    assertEqual(slugifyArea('Compton & Shawford', 'Hampshire'), 'compton-shawford-hampshire');
    // curated ids use the postcode district (oakley-rg23); a name+county slug differs
    assert(slugifyArea('Oakley', 'Hampshire') !== 'oakley-rg23', 'stub id must not collide with curated');
    // every produced id matches the area.schema.json id pattern
    for (const s of [slugifyArea('Ã‰pernay', 'Marne'), slugifyArea('  Lots  Of   Space ', '')]) {
      assert(/^[a-z0-9-]+$/.test(s), `"${s}" must match ^[a-z0-9-]+$`);
      assert(!/^-|-$/.test(s), `"${s}" must not have leading/trailing dashes`);
    }
  });

  // ── haversineKm ──────────────────────────────────────────────────────────────
  test('area-match/haversine: ~0 for identical points, sane km for a known pair, Infinity when missing', () => {
    assert(haversineKm({ lat: 51, lng: -1 }, { lat: 51, lng: -1 }) < 1e-6, 'identical → ~0');
    // Winchester ↔ Southampton ≈ 18–20 km
    const km = haversineKm({ lat: 51.0632, lng: -1.308 }, { lat: 50.9097, lng: -1.4044 });
    assert(km > 16 && km < 22, `expected ~18km, got ${km}`);
    assertEqual(haversineKm({ lat: 51, lng: -1 }, null), Infinity);
    assertEqual(haversineKm({ lat: 51, lng: null }, { lat: 51, lng: -1 }), Infinity);
  });

  test('area-match/postcodeDistrict: extracts the outward district', () => {
    assertEqual(postcodeDistrict('SO24 9RX'), 'SO24');
    assertEqual(postcodeDistrict('rg23'), 'RG23');
    assertEqual(postcodeDistrict('GU34 1AA'), 'GU34');
    assertEqual(postcodeDistrict(''), '');
  });

  // ── matchCatalogArea (match-or-create) ───────────────────────────────────────
  const catalog = [
    { id: 'west-meon-gu32', name: 'West Meon', county: 'Hampshire', coords: { lat: 51.0119, lng: -1.0876 }, postcode: 'GU32 1JG' },
    { id: 'oakley-rg23', name: 'Oakley', county: 'Hampshire', coords: { lat: 51.2447, lng: -1.1707 }, postcode: 'RG23 7DT' },
  ];

  test('area-match/match: same village within 1.5km links to the catalog area', () => {
    const place = { name: 'West Meon', county: 'Hampshire', lat: 51.0125, lng: -1.0880, postcodeDistrict: 'GU32' };
    const m = matchCatalogArea(place, catalog);
    assert(m && m.id === 'west-meon-gu32', `expected west-meon-gu32, got ${m && m.id}`);
  });

  test('area-match/match: same name but far away (different county) does NOT match → stub', () => {
    // A "West Meon" in a different county 200km away must not cross-link.
    const place = { name: 'West Meon', county: 'Devon', lat: 50.7, lng: -3.5, postcodeDistrict: 'EX1' };
    assertEqual(matchCatalogArea(place, catalog), null);
  });

  test('area-match/match: postcode-district match links even without close coords', () => {
    const place = { name: 'Oakley', county: 'Hampshire', lat: null, lng: null, postcodeDistrict: 'RG23' };
    const m = matchCatalogArea(place, catalog);
    assert(m && m.id === 'oakley-rg23', `district match should link, got ${m && m.id}`);
  });

  test('area-match/match: a genuinely new village (no name match) yields null → caller creates a stub', () => {
    const place = { name: 'Nowhereton', county: 'Hampshire', lat: 51.1, lng: -1.2, postcodeDistrict: 'SO21' };
    assertEqual(matchCatalogArea(place, catalog), null);
  });
}
