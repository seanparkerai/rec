// import-layer.test.js — architectural guard (REFACTOR P4).
// Enforces CLAUDE.md §17.4: page/tile/section/outreach modules must NOT import
// `supabase-client` directly — all Supabase access goes through `storage.js`
// (the sanctioned data layer) or `auth-guard.js` (the auth layer). Those two
// infrastructure modules are intentionally NOT in the scanned families.
//
// Node-only (reads source files); wired into the tiered harness (tools/run-all-tests.mjs),
// deliberately not into the browser harness tests.html.

export async function register({ test, assert, assertEqual, fixtures }) {
  const { readFileSync, readdirSync, existsSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const jsRoot = join(root, 'assets/js');

  // The module families the guard polices, recorded as paths relative to assets/js.
  const listJs = (sub) => {
    const dir = sub ? join(jsRoot, sub) : jsRoot;
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => (sub ? `${sub}/${f}` : f));
  };
  const scanned = [
    ...listJs('').filter((f) => /^page-.*\.js$/.test(f)), // pages (thin coordinators)
    ...listJs('dashboard'),                               // tiles
    ...listJs('finances'),                                // finance sections
    ...listJs('outreach'),                                // outreach modules
  ].sort();

  // Strip comments so a prose mention of supabase-client can't false-positive,
  // then detect a real import of the specifier (static, bare, or dynamic).
  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '')
       .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const IMPORT_RES = [
    /from\s+['"][^'"]*supabase-client(?:\.js)?['"]/,        // import x from '…/supabase-client.js'
    /import\s+['"][^'"]*supabase-client(?:\.js)?['"]/,      // import '…/supabase-client.js'
    /import\s*\(\s*['"][^'"]*supabase-client(?:\.js)?['"]/, // await import('…/supabase-client.js')
  ];
  const importsSupabaseClient = (rel) => {
    const code = stripComments(readFileSync(join(jsRoot, rel), 'utf8'));
    return IMPORT_RES.some((re) => re.test(code));
  };

  const actual = scanned.filter(importsSupabaseClient).sort();

  // No documented exceptions remain: page-data-sync.js — the last module that
  // imported supabase-client directly — was removed with the Data sync page.
  const EXPECTED_EXCEPTIONS = [];

  test('import-layer: scanned the expected module surface (≥40 files)', () => {
    assert(scanned.length >= 40, `only scanned ${scanned.length} modules — glob likely broke`);
  });

  test('import-layer: no page/tile/section/outreach module imports supabase-client outside documented exceptions', () => {
    const unexpected = actual.filter((f) => !EXPECTED_EXCEPTIONS.includes(f));
    assert(unexpected.length === 0,
      `modules importing supabase-client directly (route through storage.js instead): ${unexpected.join(', ')}`);
  });

  test('import-layer: documented exceptions are still live (no stale entries)', () => {
    const stale = EXPECTED_EXCEPTIONS.filter((f) => !actual.includes(f));
    assert(stale.length === 0,
      `listed as exceptions but no longer import supabase-client — remove from EXPECTED_EXCEPTIONS: ${stale.join(', ')}`);
  });

  test('import-layer: no documented exceptions remain', () => {
    assertEqual(EXPECTED_EXCEPTIONS.join(','), '');
  });
}
