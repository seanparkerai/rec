// Contract tests for the RLS guard rail (tools/check-rls.mjs, step 1.11).
// The online query itself runs in CI with SUPABASE_DB_URL; here we pin the
// tool's decision logic with a stubbed executor so the rail can't drift.
import { checkRls, RLS_QUERY } from '../../tools/check-rls.mjs';

export async function register({ test, assert, assertEqual }) {
  test('rls: query targets public ordinary+partitioned tables without relrowsecurity', () => {
    assert(/relrowsecurity/.test(RLS_QUERY), 'checks relrowsecurity');
    assert(/nspname = 'public'/.test(RLS_QUERY), 'scoped to public schema');
    assert(/'r', 'p'/.test(RLS_QUERY), 'covers ordinary + partitioned tables');
  });

  test('rls: no DB URL → honest skip (never reported as passing)', () => {
    const r = checkRls({ dbUrl: undefined });
    assertEqual(r.status, 'skipped');
    assert(/NOT passing/.test(r.message), 'skip message says unrun ≠ passing');
  });

  test('rls: clean database → pass', () => {
    const exec = () => ({ status: 0, stdout: '\n', stderr: '' });
    assertEqual(checkRls({ dbUrl: 'postgres://x', exec }).status, 'pass');
  });

  test('rls: any table without RLS → fail, tables named', () => {
    const exec = () => ({ status: 0, stdout: 'leaky_table\nother_table\n', stderr: '' });
    const r = checkRls({ dbUrl: 'postgres://x', exec });
    assertEqual(r.status, 'fail');
    assertEqual(r.tables.length, 2);
    assert(r.message.includes('leaky_table'), 'names the offending table');
  });

  test('rls: psql failure → error (a broken check must not pass silently)', () => {
    const exec = () => ({ status: 2, stdout: '', stderr: 'connection refused' });
    assertEqual(checkRls({ dbUrl: 'postgres://x', exec }).status, 'error');
  });
}
