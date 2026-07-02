// tests/mocks/supabase-client.js — fixture-backed Supabase stub (Phase 1 step 1.3).
// For integration/page-tier tests: answers .from(table) queries from in-memory
// rows and .auth.getSession() with a mock session. No network, ever.
//
// Usage:
//   const sb = new MockSupabaseClient({ profile: [{ household_id: 'test-001', … }] });
//   const { data, error } = await sb.from('profile').select('*').eq('household_id', 'test-001');
//
// Supported chain: select / eq / neq / in / not / ilike / order / limit / range
// / single / maybeSingle — enough for the storage layer's read paths. Writes record into
// this.writes for assertion and upsert-merge into the table rows.

/** SQL ILIKE pattern → case-insensitive anchored RegExp (% = .*, _ = .). */
function ilikeRegExp(pattern) {
  const body = String(pattern)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${body}$`, 'i');
}

const MOCK_SESSION = {
  user: { id: 'user-001', email: 'test@example.com' },
  access_token: 'mock-token',
};

class MockQuery {
  constructor(rows, writes, table) {
    this._rows = [...rows];
    this._writes = writes;
    this._table = table;
    this._single = false;
    this._maybe = false;
  }
  select() { return this; }
  eq(col, val) { this._rows = this._rows.filter((r) => r?.[col] === val); return this; }
  neq(col, val) { this._rows = this._rows.filter((r) => r?.[col] !== val); return this; }
  in(col, vals) { const set = new Set(vals); this._rows = this._rows.filter((r) => set.has(r?.[col])); return this; }
  not(col, op, val) {
    // PostgREST `not.<col>.is.<val>` semantics for val ∈ {null, true, false}.
    if (op === 'is') this._rows = this._rows.filter((r) => (r?.[col] ?? null) !== val);
    else if (op === 'ilike') {
      const re = ilikeRegExp(val);
      this._rows = this._rows.filter((r) => !re.test(String(r?.[col] ?? '')));
    }
    return this;
  }
  ilike(col, pattern) {
    const re = ilikeRegExp(pattern);
    this._rows = this._rows.filter((r) => re.test(String(r?.[col] ?? '')));
    return this;
  }
  is(col, val) { this._rows = this._rows.filter((r) => r?.[col] === val); return this; }
  order(col, { ascending = true } = {}) {
    this._rows.sort((a, b) => (a?.[col] > b?.[col] ? 1 : a?.[col] < b?.[col] ? -1 : 0) * (ascending ? 1 : -1));
    return this;
  }
  limit(n) { this._rows = this._rows.slice(0, n); return this; }
  range(from, to) { this._rows = this._rows.slice(from, to + 1); return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._single = true; this._maybe = true; return this; }
  insert(values) {
    const rows = Array.isArray(values) ? values : [values];
    this._writes.push({ table: this._table, op: 'insert', values: rows });
    return this;
  }
  upsert(values, opts) {
    const rows = Array.isArray(values) ? values : [values];
    this._writes.push({ table: this._table, op: 'upsert', values: rows, opts });
    return this;
  }
  update(values) { this._writes.push({ table: this._table, op: 'update', values }); return this; }
  delete() { this._writes.push({ table: this._table, op: 'delete' }); return this; }
  then(resolve, reject) {
    let data = this._rows;
    let error = null;
    if (this._single) {
      if (data.length === 1) data = data[0];
      else if (data.length === 0 && this._maybe) data = null;
      else if (data.length === 0) { data = null; error = { message: 'no rows', code: 'PGRST116' }; }
      else data = data[0];
    }
    return Promise.resolve({ data, error }).then(resolve, reject);
  }
}

export class MockSupabaseClient {
  /** @param {Record<string, object[]>} tables — table name → fixture rows */
  constructor(tables = {}, { session = MOCK_SESSION } = {}) {
    this.tables = tables;
    this.writes = [];
    this._session = session;
    this.auth = {
      getSession: async () => ({ data: { session: this._session }, error: null }),
      getUser: async () => ({ data: { user: this._session?.user ?? null }, error: null }),
      signOut: async () => { this._session = null; return { error: null }; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    };
  }
  from(table) { return new MockQuery(this.tables[table] ?? [], this.writes, table); }
  rpc(fn, args) {
    this.writes.push({ op: 'rpc', fn, args });
    const impl = this.tables.__rpc?.[fn];
    return Promise.resolve(impl ? impl(args) : { data: null, error: null });
  }
}

export { MOCK_SESSION };
