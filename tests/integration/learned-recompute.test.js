// Integration (step 4.7, P10c): attributed-reason aggregation persists at retrain
// time. The REAL recompute path (storage/listings/learned.js) runs under Node
// against the fixture mock via the core.js test seam: recomputeLearnedPreferences()
// must (a) attach the ranked reason counts to `derived` under the reserved
// REASON_COUNTS_KEY — recomputed wholesale from the SAME append-only log the
// weights train on, never incremented per reaction — and (b) keep preserving
// `overrides`/`dismissals` wholesale. The pure aggregation itself is pinned in
// tests/unit/trends-glance.test.js; the reserved key's inertness in
// tests/unit/refinement-view.test.js.
import { MockSupabaseClient } from '../mocks/supabase-client.js';
import { REASON_COUNTS_KEY } from '../../assets/js/learned-preferences.js';

const HID = 'house-001';
const SESSION = { user: { id: 'user-001', email: 'test@example.com' }, access_token: 't' };

async function loadLearned(tables) {
  const core = await import('../../assets/js/storage/core.js');
  core._resetStorageForTests();
  globalThis.__REC_TEST_SB__ = new MockSupabaseClient(tables, { session: SESSION });
  const learned = await import('../../assets/js/storage/listings/learned.js');
  return { learned, sb: globalThis.__REC_TEST_SB__ };
}

// Enough graded reactions to clear COLD_START_MIN (10) so deriveWeights runs too.
function reactionRows() {
  const rows = [];
  const snap = { property_type: 'flat', price: 250000, beds: 2 };
  for (let i = 0; i < 8; i++) {
    rows.push({
      id: `r-rej-${i}`, household_id: HID, listing_id: `L${i}`, reaction: 'reject',
      reasons: i < 5 ? [{ key: 'too_expensive' }] : [{ key: 'wrong_area' }, { key: 'too_expensive' }],
      created_at: `2026-06-1${i}T10:00:00Z`, listing_snapshot: snap,
    });
  }
  for (let i = 0; i < 4; i++) {
    rows.push({
      id: `r-like-${i}`, household_id: HID, listing_id: `M${i}`, reaction: 'like',
      reasons: [{ key: 'great_area' }],
      created_at: `2026-06-2${i}T10:00:00Z`,
      listing_snapshot: { property_type: 'detached', price: 400000, beds: 3 },
    });
  }
  return rows;
}

export async function register({ test, assert, assertEqual }) {
  const quiet = async (fn) => {
    const orig = console.error; console.error = () => {};
    try { return await fn(); } finally { console.error = orig; }
  };

  test('recompute: persists ranked reason counts under the reserved derived key', async () => {
    const { learned, sb } = await loadLearned({
      household_members: [{ user_id: 'user-001', household_id: HID }],
      listing_reactions: reactionRows(),
      shortlist: [],
      learned_preferences: [{
        household_id: HID, derived: {},
        overrides: { __refinement_hidden: { 'area:x': { at: '2026-06-01' } } },
        dismissals: { 'conflict:over-budget': { kind: 'dismiss', until: '2099-01-01' } },
      }],
    });
    const res = await quiet(() => learned.recomputeLearnedPreferences({ now: new Date('2026-07-02T00:00:00Z') }));
    assert(res, 'recompute completed');
    const counts = res.derived[REASON_COUNTS_KEY];
    assert(counts, 'reason counts attached to derived');
    assertEqual(counts.reject[0].key, 'too_expensive', 'most-cited dislike first');
    assertEqual(counts.reject[0].count, 8, 'every attributed mention counted');
    assertEqual(counts.reject[1].key, 'wrong_area');
    assertEqual(counts.reject[1].count, 3);
    assert(counts.reject[0].label, 'counts carry display labels');
    assertEqual(counts.like[0].key, 'great_area', 'like reasons aggregated too');

    // The same object was written to Supabase, and user-owned state was preserved.
    const w = sb.writes.filter((x) => x.table === 'learned_preferences' && x.op === 'upsert').pop();
    assert(w, 'learned_preferences upsert issued');
    const row = w.values[0]; // the mock normalises upsert values to an array of rows
    assertEqual(row.household_id, HID, 'scoped to the current household');
    assertEqual(row.derived[REASON_COUNTS_KEY].reject[0].count, 8, 'counts persisted');
    assert(row.overrides.__refinement_hidden, 'overrides preserved wholesale');
    assert(row.dismissals['conflict:over-budget'], 'dismissals preserved wholesale');
    assert(Object.keys(res.derived).some((k) => !k.startsWith('__')),
      'real signal weights derived alongside the reserved key');
  });

  test('recompute: no attributed reasons → empty counts object, still attached', async () => {
    const bare = reactionRows().map((r) => ({ ...r, reasons: [] }));
    const { learned } = await loadLearned({
      household_members: [{ user_id: 'user-001', household_id: HID }],
      listing_reactions: bare,
      shortlist: [],
      learned_preferences: [],
    });
    const res = await quiet(() => learned.recomputeLearnedPreferences({ now: new Date('2026-07-02T00:00:00Z') }));
    assert(res, 'recompute completed');
    const counts = res.derived[REASON_COUNTS_KEY];
    assert(counts, 'counts key present even with nothing attributed (shape is stable)');
    assertEqual(counts.reject.length, 0);
    assertEqual(counts.like.length, 0);
  });
}
