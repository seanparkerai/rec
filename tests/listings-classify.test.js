// tests/listings-classify.test.js — the shared listing classifier: the single
// "houses & bungalows" allow-list, the price/beds baseline gate enforced by both
// the live fetcher and the backfill importer, and the physical-property
// fingerprint that collapses re-lists / duplicates across changing rightmove_ids.
import {
  propertyTypeClass, isAllowedPropertyType, passesBaseline, propertyFingerprint,
  BASELINE_PRICE_MIN, BASELINE_PRICE_MAX, BASELINE_MIN_BEDS,
} from '../assets/js/listings/classify.js';

export async function register({ test, assert, assertEqual }) {
  // ── property-type allow-list (broad houses + bungalows) ────────────────────
  const HOUSES = [
    'Detached', 'Semi-Detached', 'Terraced', 'End of Terrace', 'Town House',
    'Cottage', 'Link Detached House', 'Bungalow', 'Detached Bungalow',
    'Semi-Detached Bungalow', 'Terraced Bungalow', 'Character Property',
    'Barn Conversion', 'Mews', 'House', 'Farm House', 'Country House', 'Manor House',
  ];
  const NOT_HOMES = [
    'Flat', 'Apartment', 'Maisonette', 'Ground Flat', 'Ground Maisonette',
    'Penthouse', 'Studio', 'Duplex', 'Coach House', 'Park Home', 'Mobile Home',
    'Lodge', 'Chalet', 'Land', 'Plot', 'Farm Land', 'Equestrian Facility',
    'Garages', 'House Share', 'House of Multiple Occupation', 'Retirement Property',
    'Not Specified',
  ];

  test('classify: every house/bungalow form is allowed', () => {
    for (const t of HOUSES) assertEqual(propertyTypeClass(t), 'house', `${t} → house`);
  });

  test('classify: flats, land, park homes, retirement etc. are excluded', () => {
    for (const t of NOT_HOMES) assertEqual(propertyTypeClass(t), 'excluded', `${t} → excluded`);
  });

  test('classify: "house"-containing non-homes are NOT mistaken for houses', () => {
    // The broad "house" allow rule must lose to the excluded list for these.
    assertEqual(isAllowedPropertyType('Coach House'), false, 'coach house excluded');
    assertEqual(isAllowedPropertyType('House Share'), false, 'house share excluded');
    assertEqual(isAllowedPropertyType('House of Multiple Occupation'), false, 'HMO excluded');
    // …while genuine "<x> House" homes stay allowed.
    assertEqual(isAllowedPropertyType('Town House'), true, 'town house allowed');
    assertEqual(isAllowedPropertyType('Country House'), true, 'country house allowed');
  });

  test('classify: an unrecognised/empty type is treated as not-a-home (tight)', () => {
    assertEqual(propertyTypeClass(''), 'unknown');
    assertEqual(propertyTypeClass(null), 'unknown');
    assertEqual(isAllowedPropertyType('Houseboat'), false);
  });

  // ── baseline gate (type + price band + beds) ───────────────────────────────
  const mk = (o) => ({ property_type: 'Terraced', price: 300000, beds: 2, ...o });

  test('baseline: a 2-bed terraced house in band passes', () => {
    assert(passesBaseline(mk({})), 'in-band house passes');
  });

  test('baseline: excluded type fails regardless of price/beds', () => {
    assertEqual(passesBaseline(mk({ property_type: 'Flat' })), false);
    assertEqual(passesBaseline(mk({ property_type: 'Park Home', price: 249995, beds: 3 })), false);
    assertEqual(passesBaseline(mk({ property_type: 'Land', price: 200000 })), false);
  });

  test('baseline: a KNOWN price outside the band fails', () => {
    assertEqual(passesBaseline(mk({ price: BASELINE_PRICE_MAX + 1 })), false, 'over ceiling fails');
    assertEqual(passesBaseline(mk({ price: BASELINE_PRICE_MIN - 1 })), false, 'under floor fails (mispriced/share)');
    assertEqual(passesBaseline(mk({ property_type: 'Detached', price: 9750000, beds: 5 })), false, '£9.75m fails');
  });

  test('baseline: KNOWN beds below the minimum fails', () => {
    assertEqual(passesBaseline(mk({ beds: 1 })), false);
    assert(passesBaseline(mk({ beds: BASELINE_MIN_BEDS })), 'exactly the minimum passes');
  });

  test('baseline: UNKNOWN price/beds do not reject (null is not zero)', () => {
    // The Number(null)===0 trap: a re-fetched summary can omit price/beds and must
    // not be dropped on those axes — only the type rule is unconditional.
    assert(passesBaseline(mk({ price: null })), 'null price → kept (type+beds still gate)');
    assert(passesBaseline(mk({ beds: null })), 'null beds → kept');
    assertEqual(passesBaseline(mk({ price: null, property_type: 'Apartment' })), false, 'type still gates');
  });

  // ── physical-property fingerprint (identity across re-lists) ───────────────
  test('fingerprint: a re-list at a CHANGED price matches its prior self', () => {
    // The real Burgate pair: same 2-bed semi on Burgate, two ids, £300k vs £280k.
    const a = { address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached' };
    const b = { address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached House' };
    const fpa = propertyFingerprint(a);
    assert(fpa, 'fingerprint computed for a specific address');
    assertEqual(propertyFingerprint(b), fpa, 'price-insensitive + type-noise-insensitive match');
  });

  test('fingerprint: county + postcode noise in the address is ignored', () => {
    const a = { address: 'Farriers, Fordingbridge, SP6', beds: 2, property_type: 'Terraced' };
    const b = { address: 'Farriers, Fordingbridge, Hampshire, SP6', beds: 2, property_type: 'Terraced' };
    assertEqual(propertyFingerprint(a), propertyFingerprint(b), 'same property despite address variants');
  });

  test('fingerprint: a bare town-only address is too coarse → null (no false merge)', () => {
    // Many rows are just "Fordingbridge" — these must NOT collapse into one property.
    assertEqual(propertyFingerprint({ address: 'Fordingbridge', beds: 3, property_type: 'Terraced' }), null);
    assertEqual(propertyFingerprint({ address: '', beds: 3, property_type: 'Terraced' }), null);
  });

  test('fingerprint: distinct streets do not collide; a live row and a snapshot agree', () => {
    const augustus = { address: 'Augustus Avenue, Fordingbridge, SP6', beds: 2, property_type: 'Semi-Detached' };
    const burgate = { address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached' };
    assert(propertyFingerprint(augustus) !== propertyFingerprint(burgate), 'different streets, different fingerprints');
    // A reaction snapshot carries the same shape as a live row → identical fingerprint.
    const snapshot = { address: 'Augustus Avenue, Fordingbridge, SP6', beds: 2, property_type: 'Semi-Detached' };
    assertEqual(propertyFingerprint(snapshot), propertyFingerprint(augustus));
  });

  test('fingerprint: differing beds or type → different property', () => {
    const base = { address: 'Augustus Avenue, Fordingbridge, SP6', beds: 2, property_type: 'Semi-Detached' };
    assert(propertyFingerprint({ ...base, beds: 3 }) !== propertyFingerprint(base), 'beds matter');
    assert(propertyFingerprint({ ...base, property_type: 'Detached' }) !== propertyFingerprint(base), 'type matters');
  });
}
