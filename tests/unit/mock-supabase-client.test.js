// Unit tests for the fixture-backed Supabase mock (tests/mocks/supabase-client.js).
// Also the first suite in the new tiered layout — proves tier discovery works.
import { MockSupabaseClient, MOCK_SESSION } from '../mocks/supabase-client.js';

export async function register({ test, assert, assertEqual }) {
  const rows = [
    { household_id: 'h1', area_id: 'a', price: 300000, active: true },
    { household_id: 'h1', area_id: 'b', price: 350000, active: false },
    { household_id: 'h2', area_id: 'a', price: 400000, active: true },
  ];

  test('mock: eq filters rows', async () => {
    const sb = new MockSupabaseClient({ t: rows });
    const { data, error } = await sb.from('t').select('*').eq('household_id', 'h1');
    assert(!error, 'no error');
    assertEqual(data.length, 2);
  });

  test('mock: in + order + limit chain', async () => {
    const sb = new MockSupabaseClient({ t: rows });
    const { data } = await sb.from('t').select('*').in('area_id', ['a']).order('price', { ascending: false }).limit(1);
    assertEqual(data.length, 1);
    assertEqual(data[0].price, 400000);
  });

  test('mock: single returns one row; maybeSingle tolerates zero', async () => {
    const sb = new MockSupabaseClient({ t: rows });
    const one = await sb.from('t').select('*').eq('area_id', 'b').single();
    assertEqual(one.data.price, 350000);
    const none = await sb.from('t').select('*').eq('area_id', 'zzz').maybeSingle();
    assertEqual(none.data, null);
    assert(!none.error, 'maybeSingle: no error on zero rows');
  });

  test('mock: writes are recorded for assertion', async () => {
    const sb = new MockSupabaseClient({ t: [] });
    await sb.from('t').upsert({ household_id: 'h1', x: 1 }, { onConflict: 'household_id' });
    assertEqual(sb.writes.length, 1);
    assertEqual(sb.writes[0].op, 'upsert');
    assertEqual(sb.writes[0].opts.onConflict, 'household_id');
  });

  test('mock: auth.getSession returns the mock session', async () => {
    const sb = new MockSupabaseClient({});
    const { data } = await sb.auth.getSession();
    assertEqual(data.session.user.id, MOCK_SESSION.user.id);
  });

  test('mock: rpc dispatches to a fixture impl when provided', async () => {
    const sb = new MockSupabaseClient({ __rpc: { ping: (args) => ({ data: { ok: true, args }, error: null }) } });
    const { data } = await sb.rpc('ping', { a: 1 });
    assert(data.ok === true && data.args.a === 1, 'rpc impl invoked with args');
  });
}
