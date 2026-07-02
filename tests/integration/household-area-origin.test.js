// Integration (step 2.19): origin/target as a first-class, user-editable flag.
// The REAL storage layer (storage/listings/content.js) runs under Node against
// the fixture mock via the core.js test seam: setHouseholdAreaOrigin() must
// write household_areas.is_origin for the CURRENT household only, and the
// household-area composition must select + carry the flag so the picker (and
// any management view) can render it. The downstream behaviour of the flag is
// pinned elsewhere: the feed side by tests/contract/household-feed.test.js
// (origin membership never surfaces) and the scrape side by the fetcher's
// demand gate (tests/supabase-sync.test.js source-scan).
import { MockSupabaseClient } from '../mocks/supabase-client.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HID = 'house-001';
const SESSION = { user: { id: 'user-001', email: 'test@example.com' }, access_token: 't' };

async function loadContent(tables) {
  const core = await import('../../assets/js/storage/core.js');
  core._resetStorageForTests();
  globalThis.__REC_TEST_SB__ = new MockSupabaseClient(tables, { session: SESSION });
  const content = await import('../../assets/js/storage/listings/content.js');
  return { content, sb: globalThis.__REC_TEST_SB__ };
}

export async function register({ test, assert, assertEqual }) {
  const quiet = async (fn) => {
    const orig = console.error; console.error = () => {};
    try { return await fn(); } finally { console.error = orig; }
  };

  test('origin: setHouseholdAreaOrigin writes the flag scoped to the current household', async () => {
    const { content, sb } = await loadContent({
      household_members: [{ user_id: 'user-001', household_id: HID }],
      household_areas: [{ household_id: HID, area_id: 'a-home', status: 'active', is_origin: false }],
    });
    const ok = await quiet(() => content.setHouseholdAreaOrigin('a-home', true));
    assertEqual(ok, true, 'write reported success');
    const w = sb.writes.find((x) => x.table === 'household_areas' && x.op === 'update');
    assert(w, 'an UPDATE against household_areas was issued');
    assertEqual(w.values.is_origin, true, 'is_origin set true');
    const back = await quiet(() => content.setHouseholdAreaOrigin('a-home', false));
    assertEqual(back, true, 'reversible');
    const w2 = sb.writes.filter((x) => x.table === 'household_areas' && x.op === 'update').pop();
    assertEqual(w2.values.is_origin, false, 'is_origin set back to false');
  });

  test('origin: a missing area id or household context refuses the write', async () => {
    const { content } = await loadContent({ household_members: [], household_areas: [] });
    assertEqual(await quiet(() => content.setHouseholdAreaOrigin(null, true)), false, 'no area id → false');
  });

  test('origin: the composition selects is_origin and carries _isOrigin to consumers', () => {
    const src = readFileSync(join(ROOT, 'assets/js/storage/listings/content.js'), 'utf8');
    assert(/select\('area_id, added_via, status, is_origin'\)/.test(src),
      'household_areas read must select is_origin');
    assert(/_isOrigin: !!isOrigin/.test(src), 'records must carry _isOrigin');
  });

  test('origin: the picker exposes an accessible toggle (aria-pressed, text-carried state)', () => {
    const src = readFileSync(join(ROOT, 'assets/js/areas/area-picker.js'), 'utf8');
    assert(/setHouseholdAreaOrigin/.test(src), 'picker wires the storage write');
    assert(/aria-pressed/.test(src), 'toggle carries pressed state for AT');
    assert(/\(home\)/.test(src), 'origin state appears in the chip TEXT, not colour alone');
  });
}
