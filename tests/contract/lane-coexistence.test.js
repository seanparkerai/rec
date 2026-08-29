// lane-coexistence.test.js — the rail behind the owner's directive (2026-08-28):
// "ensuring I can still utilise previous search mechanisms and things an additional
// features independent with all the right controls."
//
// The legacy criteria-driven search (lane A) and the new profile-driven search
// (lane B) are INDEPENDENT. The approved plan originally said to delete lane A;
// that was overruled. This suite is what stops it happening by accident — through
// a refactor, a cleanup, or a future phase quietly rerouting the legacy path.
//
// The load-bearing assertion is the first one: with no profiles, the constructed
// search URL must be byte-identical to what it was before lane B existed. If that
// ever fails, the existing search has silently changed.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSearchUrl, buildProfileTargets, bandFromSpec, buildActorInput, priceBandForAreas,
} from '../../tools/fetch-listings.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(resolve(ROOT, 'tools/fetch-listings.mjs'), 'utf8');

export async function register({ test, assert, assertEqual }) {
  test('coexistence: with no profile, the search URL is byte-identical to pre-lane-B', () => {
    // Pinned literally. Lane B threads extra options through the SAME builder, so
    // this is the guarantee that an absent profile changes precisely nothing.
    const url = buildSearchUrl('OUTCODE^123', null, { priceMin: 300000, priceMax: 425000, minBeds: 2 });
    assertEqual(
      url,
      'https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=OUTCODE^123'
      + '&searchType=SALE&sortType=6&maxDaysSinceAdded=3&minPrice=300000&maxPrice=425000'
      + '&minBedrooms=2&dontShow=retirement%2CsharedOwnership'
      + '&propertyTypes=detached%2Csemi-detached%2Cterraced%2Cbungalow',
      'the legacy search URL changed — lane B has leaked into lane A');
  });

  test('coexistence: lane A is still wired in main() and was NOT deleted', () => {
    // §5.3 of the plan said to delete these. The owner overruled it. A future
    // phase removing them is its own named, approved decision — never a side effect.
    assert(/async function loadHouseholdCriteria\(/.test(src), 'loadHouseholdCriteria must survive');
    assert(/function priceBandForAreas\(/.test(src), 'priceBandForAreas must survive');
    assert(/const \{ budgets, criteriaRows \} = await loadHouseholdCriteria\(\)/.test(src),
      'main() must still load household criteria — that IS the legacy lane');
    assert(/priceBandForAreas\(areas\.map\(\(a\) => a\.id\), areaHouseholds, budgets\)/.test(src),
      'a lane-A target must still price from the household-budget union');
    assert(typeof priceBandForAreas === 'function', 'and it must still be exported');
  });

  test('coexistence: the two lanes have independent switches', () => {
    assert(/legacy_enabled/.test(src), 'lane A has its own switch, separate from the global gate');
    assert(/const laneA = await legacyEnabled\(\)/.test(src), 'main() must consult it');
    assert(/targets = \[\.\.\.targets, \.\.\.profileTargets\]/.test(src),
      'lane B must be APPENDED to lane A, never replace it');
  });

  test('coexistence: the legacy lane switch defaults ON, even on failure', () => {
    // Turning off the existing search must be a deliberate act. A Supabase blip
    // must never do it — the opposite stance from the global spend gate, and
    // deliberately so: this switch cannot authorise spend, only withhold it.
    const fn = src.slice(src.indexOf('async function legacyEnabled('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert(/return true;\n  \}\n\} catch|catch \{\n    return true;/.test(body) || /catch \{\s*return true;/.test(body),
      'legacyEnabled must return true on a read failure');
    assert(/rows\?\.\[0\]\?\.legacy_enabled !== false/.test(body),
      'only an explicit false may disable the legacy lane');
  });

  test('coexistence: lane B failure leaves lane A untouched', () => {
    // loadActiveProfiles returns [] rather than throwing, so a profile-table
    // outage cannot take the legacy search down with it.
    assert(/lane B skipped, lane A unaffected/.test(src),
      'a profiles read failure must degrade to zero profile targets, not abort the run');
    assertEqual(buildProfileTargets(new Map(), [], new Map()).length, 0,
      'no profiles means no profile targets');
  });

  test('coexistence: a lane-A actor input carries no profile-only parameters', () => {
    const input = buildActorInput('OUTCODE^123', null, null, { min: 300000, max: 425000, minBeds: 2 });
    const url = input.listUrls[0].url;
    assert(!/[?&]keywords=/.test(url), 'no keywords on a legacy search');
    assert(/sortType=6/.test(url), 'legacy sort is unchanged');
  });

  test('coexistence: an exact-price profile pins min === max', () => {
    const b = bandFromSpec({ priceMode: 'exact', price: 400000, minBeds: 2 });
    assertEqual(b.min, 400000, 'exact min');
    assertEqual(b.max, 400000, 'exact max — the whole point of the exact-price design');
  });

  test('coexistence: a migrated legacy RANGE profile still resolves to its band', () => {
    // The unpause path the plan promises depends on this: switching the seeded
    // "Original search (legacy)" profile on must reproduce that household's band.
    const b = bandFromSpec({ priceMode: 'range', priceMin: 300000, priceMax: 425000, minBeds: 2 });
    assertEqual(b.min, 300000, 'legacy min preserved');
    assertEqual(b.max, 425000, 'legacy max preserved');
  });

  test('coexistence: profiles sharing a signature collapse to ONE search', () => {
    // This is what stops N households multiplying the bill.
    const village = { id: 'a1', name: 'A', outcode: 'SP11', lat: 51, lng: -1.5 };
    const map = new Map([['SP11', [village]]]);
    const spec = { priceMode: 'exact', price: 400000, minBeds: 2, recencyDays: null, sort: 'oldest', keywords: [], propertyTypes: ['detached'], areaScope: 'household' };
    const profiles = [
      { id: 'p1', household_id: 'h1', name: 'one', spec },
      { id: 'p2', household_id: 'h2', name: 'two', spec: { ...spec } },
    ];
    const householdAreas = new Map([['h1', new Set(['a1'])], ['h2', new Set(['a1'])]]);
    const targets = buildProfileTargets(map, profiles, householdAreas);
    assertEqual(targets.length, 1, 'two identical specs must produce ONE paid search, not two');
    assertEqual(targets[0].profileIds.length, 2, 'and both profiles must be credited with it');
  });

  test('coexistence: a profile only ever searches its own household’s active areas', () => {
    const map = new Map([['SP11', [{ id: 'a1', outcode: 'SP11', lat: 51, lng: -1.5 }, { id: 'a2', outcode: 'SP11', lat: 51, lng: -1.5 }]]]);
    const spec = { priceMode: 'exact', price: 400000, minBeds: 2, recencyDays: null, sort: 'newest', keywords: [], areaScope: 'household' };
    // h1 holds only a1, so a2 must never be searched on its behalf.
    const targets = buildProfileTargets(map, [{ id: 'p1', household_id: 'h1', name: 'one', spec }], new Map([['h1', new Set(['a1'])]]));
    const ids = targets.flatMap((t) => (t.areas || []).map((v) => v.id));
    assertEqual(ids.join(','), 'a1', 'another household’s area must never enter this profile’s scope');
  });
}
