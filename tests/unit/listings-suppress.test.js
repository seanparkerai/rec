// tests/listings-suppress.test.js — pure feed suppression + de-duplication over
// the physical-property fingerprint. Verifies that a property decided under one
// rightmove_id (like/reject) is suppressed even when re-listed under another id,
// that `pass` now suppresses like `reject` (passed/rejected moved to their own page),
// and that duplicate rows collapse to one rep.
import { decidedSets, isDecided, dedupeByFingerprint } from '../../assets/js/listings/suppress.js';
import { propertyFingerprint } from '../../assets/js/listings/classify.js';

export async function register({ test, assert, assertEqual }) {
  const snap = (address, beds, property_type) => ({ address, beds, property_type });
  const latest = new Map([
    ['100', { reaction: 'like',   listing_snapshot: snap('Burgate, FORDINGBRIDGE', 2, 'Semi-Detached') }],
    ['200', { reaction: 'reject', listing_snapshot: snap('Augustus Avenue, Fordingbridge, SP6', 2, 'Terraced') }],
    ['300', { reaction: 'pass',   listing_snapshot: snap('Whitsbury Road, Fordingbridge', 3, 'Detached') }],
  ]);

  test('suppress: decidedSets includes like, pass and reject ids', () => {
    const { ids } = decidedSets(latest);
    assert(ids.has('100') && ids.has('200'), 'like + reject ids present');
    assertEqual(ids.has('300'), true, 'a passed listing is now decided too');
  });

  test('suppress: decidedSets captures the property fingerprint from snapshots', () => {
    const { fps } = decidedSets(latest);
    assert(fps.has(propertyFingerprint(snap('Burgate, FORDINGBRIDGE', 2, 'Semi-Detached'))), 'liked fp present');
    assert(fps.has(propertyFingerprint(snap('Augustus Avenue, Fordingbridge, SP6', 2, 'Terraced'))), 'rejected fp present');
  });

  test('suppress: a re-list under a NEW id is still decided (fingerprint match)', () => {
    const sets = decidedSets(latest);
    // The real Burgate case: liked as id 100; re-listed as a brand-new id at a new
    // price with slightly different type text — still the same property.
    const twin = { rightmove_id: '999999', address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached House' };
    assertEqual(isDecided(twin, sets), true, 're-list suppressed by fingerprint');
  });

  test('suppress: a passed property is decided by id and fingerprint, like a reject', () => {
    const sets = decidedSets(latest);
    // Whitsbury Road was PASSED → now decided; its re-list under a new id is also
    // caught by fingerprint (pass suppresses the feed exactly like reject).
    assertEqual(isDecided({ rightmove_id: '300', address: 'Whitsbury Road, Fordingbridge', beds: 3, property_type: 'Detached' }, sets), true);
    const passTwin = { rightmove_id: '997', address: 'Whitsbury Road, Fordingbridge', beds: 3, property_type: 'Detached House' };
    assertEqual(isDecided(passTwin, sets), true, 're-list of a passed property is suppressed by fingerprint');
    // Direct id match always suppresses (even when the row can't be fingerprinted).
    assertEqual(isDecided({ rightmove_id: '100', address: '', beds: 2, property_type: 'Flat' }, sets), true);
  });

  test('suppress: dedupeByFingerprint collapses a re-list pair, keeps the newest', () => {
    const rows = [
      { listing: { rightmove_id: 'a', address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached', first_seen: '2026-05-31', price: 300000 } },
      { listing: { rightmove_id: 'b', address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached House', first_seen: '2026-06-03', price: 280000 } },
      { listing: { rightmove_id: 'c', address: 'Fordingbridge', beds: 3, property_type: 'Terraced' } }, // town-only → null fp → kept
    ];
    const out = dedupeByFingerprint(rows, (r) => r.listing);
    assertEqual(out.length, 2, 'the Burgate pair collapses; the town-only row survives');
    const burgate = out.find((r) => r.listing.address.includes('Burgate'));
    assertEqual(burgate.listing.rightmove_id, 'b', 'the newer (06-03) row is the representative');
  });

  test('suppress: town-only / unfingerprintable rows never falsely merge', () => {
    const rows = [
      { listing: { rightmove_id: 'x', address: 'Fordingbridge', beds: 3, property_type: 'Terraced' } },
      { listing: { rightmove_id: 'y', address: 'Fordingbridge', beds: 3, property_type: 'Terraced' } },
    ];
    assertEqual(dedupeByFingerprint(rows, (r) => r.listing).length, 2, 'both kept — coarse address is not an identity');
  });
}
