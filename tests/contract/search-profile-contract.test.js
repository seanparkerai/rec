// search-profile-contract.test.js — the rails around search profiles (Phase 1b).
//
// The property-type allow-list exists in TWO places by necessity: the fetcher
// (Node, builds the Rightmove URL) and profile-spec.js (browser + Node, validates
// what a user may ask for). If they drift, a profile could be accepted by the UI
// and then silently widened or narrowed at fetch time — the class of bug where the
// user sees one search and pays for another. This suite makes that drift loud.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_PROPERTY_TYPES } from '../../tools/fetch-listings.mjs';
import { ALLOWED_PROPERTY_TYPES, MAX_KEYWORDS, SORTS } from '../../assets/js/search/profile-spec.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (p) => readFileSync(resolve(ROOT, p), 'utf8');

export async function register({ test, assert, assertEqual }) {
  test('search-profile: the property-type allow-list matches the fetcher exactly', () => {
    assertEqual(
      [...ALLOWED_PROPERTY_TYPES].sort().join(','),
      [...BASELINE_PROPERTY_TYPES].sort().join(','),
      'profile-spec.ALLOWED_PROPERTY_TYPES has drifted from fetch-listings.BASELINE_PROPERTY_TYPES — ' +
      'a profile would then validate against one list and be fetched against another');
  });

  test('search-profile: the allow-list still excludes the whole flat family', () => {
    // Omitting `flat` excludes apartments, maisonettes, penthouses, studios, coach
    // houses and duplexes in one shot — Rightmove files them all under that slug.
    // Re-admitting any of them is a deliberate owner decision, never a refactor.
    for (const banned of ['flat', 'apartment', 'land', 'park-home']) {
      assert(!ALLOWED_PROPERTY_TYPES.includes(banned), `${banned} must stay excluded at source`);
    }
  });

  test('search-profile: keyword cap matches Rightmove’s own limit', () => {
    assertEqual(MAX_KEYWORDS, 3, 'Rightmove accepts at most 3 keywords — sending more is silently dropped');
  });

  test('search-profile: sort vocabulary is the verified Rightmove enum', () => {
    // Off-enum values return zero results silently, the same failure class as the
    // off-ladder radius that blanked 36 of 56 targets for months (ADR 0011).
    assertEqual(SORTS.newest, 6, 'newest listed');
    assertEqual(SORTS.oldest, 10, 'oldest listed');
  });

  test('search-profile: keywords are a HARD filter here, because Rightmove only ranks', () => {
    // Rightmove's own `keywords=` re-orders results and leaves the count unchanged,
    // so the guarantee the owner asked for ("only properties carrying one of my
    // tags") can only be delivered after the fetch. If this gate ever goes away,
    // untagged properties reach the feed.
    const spec = src('assets/js/search/profile-spec.js');
    assert(/export function keywordGate/.test(spec), 'the hard keyword gate must exist');
    assert(/\\\\b\$\{escapeRe\(k\)\}\\\\b/.test(spec), 'matching must be whole-word and the keyword must be regex-escaped');
    assert(/if \(!kws\.length\) return \{ keep: true, hits: \[\] \}/.test(spec),
      'an empty keyword list must filter NOTHING — inverting this silently empties a feed');
  });

  test('search-profile: the storage layer never writes admin_paused', () => {
    // admin_paused is the admin control plane's field. A member writing it would
    // make the admin panel advisory rather than authoritative. The DB trigger
    // guard_admin_paused enforces this too; this is the client-side half.
    const store = src('assets/js/storage/user-state/search-profiles.js');
    assert(!/admin_paused:/.test(store), 'the storage layer must never set admin_paused');
    assert(/admin_paused is never written from here/.test(store), 'and must say why, at the point it matters');
  });

  test('search-profile: a new profile cannot be created with a legacy price range', () => {
    // Exact prices only, by owner decision. The legacy range survives solely on the
    // migrated profiles so that switching one back on reproduces today exactly.
    const store = src('assets/js/storage/user-state/search-profiles.js');
    assert(/allowLegacyRange: isUpdate/.test(store),
      'legacy ranges may be edited but never created — otherwise "exact prices only" erodes');
  });
}
