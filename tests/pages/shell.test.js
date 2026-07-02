// tests/pages/shell.test.js — first DOM-tier suite (step 1.9).
// Renders the real shell partials (components/{header,nav,footer}.html) into a
// jsdom document via the pure shell core (assets/js/shell-core.js) and asserts
// injection, nav href resolution + active state, failure fallback, and theming.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import {
  injectIncludes, setActiveNav, normalisePath, applyTheme, effectiveTheme, updateToggle, THEME_KEY,
} from '../../assets/js/shell-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://example.test';

/** A minimal page skeleton matching the real pages' include markup. */
function pageDom(pathname) {
  const html = `<!doctype html><html><head></head><body>
    <div data-include="components/header.html"></div>
    <div data-include="components/nav.html"></div>
    <main id="main"></main>
    <div data-include="components/footer.html"></div>
  </body></html>`;
  return new JSDOM(html, { url: `${ORIGIN}${pathname}` });
}

/** urlFor mapping app-root-relative paths onto the fake origin (like GH Pages at "/"). */
const urlFor = (p) => new URL(String(p).replace(/^\/+/, ''), `${ORIGIN}/`).href;

/** fetch stub serving repo files for the fake origin. */
const diskFetch = async (href) => {
  const pathname = new URL(href).pathname.replace(/^\//, '');
  try {
    const text = readFileSync(join(ROOT, pathname), 'utf8');
    return { ok: true, status: 200, text: async () => text };
  } catch {
    return { ok: false, status: 404, text: async () => '' };
  }
};

async function renderShell(pathname) {
  const dom = pageDom(pathname);
  const doc = dom.window.document;
  const loc = dom.window.location;
  await injectIncludes({ doc, urlFor, fetchFn: diskFetch });
  setActiveNav({ doc, loc, urlFor });
  return { dom, doc };
}

export async function register({ test, assert, assertEqual }) {
  test('shell: header/nav/footer partials inject into the page DOM', async () => {
    const { doc } = await renderShell('/pages/listings.html');
    assert(doc.querySelector('.skip-link'), 'skip-link present (first focusable, CLAUDE.md §11)');
    assert(doc.getElementById('nav-toggle'), 'burger button injected from header.html');
    assert(doc.getElementById('theme-toggle'), 'theme toggle injected');
    assert(doc.getElementById('nav-drawer')?.tagName === 'DIALOG', 'nav drawer is a native <dialog>');
    assert(!doc.querySelector('[data-include]'), 'no unresolved [data-include] placeholders remain');
  });

  test('shell: data-nav hrefs resolve absolute and exactly one link is aria-current', async () => {
    const { doc } = await renderShell('/pages/listings.html');
    const links = [...doc.querySelectorAll('[data-nav]')];
    assert(links.length >= 8, `expected the full nav, got ${links.length} links`);
    assert(links.every((a) => a.getAttribute('href')?.startsWith(`${ORIGIN}/`)), 'every href resolved absolute');
    const current = links.filter((a) => a.getAttribute('aria-current') === 'page');
    assertEqual(current.length, 1, 'exactly one active nav entry');
    assertEqual(current[0].dataset.nav, 'pages/listings.html');
  });

  test('shell: index.html and bare / mark Home active identically (incl. both brand lockups)', async () => {
    // Characterized behaviour: on the home page THREE links match — the header
    // brand, the drawer brand, and the Home nav item — and all three carry
    // aria-current="page". Semantically valid ARIA; whether the brands should
    // be exempt is a Phase-3 a11y design question, not a silent change here.
    for (const path of ['/index.html', '/']) {
      const { doc } = await renderShell(path);
      const current = [...doc.querySelectorAll('[data-nav][aria-current="page"]')];
      assertEqual(current.length, 3, `brand + drawer-brand + Home all active at ${path}`);
      assert(current.every((a) => a.dataset.nav === 'index.html'), 'all point at index.html');
      assert(current.some((a) => !a.classList.contains('brand')), 'the nav-list Home item is among them');
    }
  });

  test('shell: a failed include degrades to a comment node, others still inject', async () => {
    const dom = new JSDOM(
      '<body><div data-include="components/does-not-exist.html"></div><div data-include="components/footer.html"></div></body>',
      { url: `${ORIGIN}/index.html` },
    );
    const doc = dom.window.document;
    const origError = console.error; console.error = () => {};
    try { await injectIncludes({ doc, urlFor, fetchFn: diskFetch }); }
    finally { console.error = origError; }
    assert(!doc.querySelector('[data-include]'), 'both placeholders consumed');
    const comments = [];
    const walker = doc.createTreeWalker(doc.body, 128 /* NodeFilter.SHOW_COMMENT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) comments.push(n.textContent);
    assert(comments.some((c) => c.includes('include failed: components/does-not-exist.html')), 'failure comment left');
    assert(doc.querySelector('.site-footer, footer'), 'healthy include still injected');
  });

  test('shell (3.3): a hung partial fetch times out — shell resolves, fallback + visible error', async () => {
    const dom = pageDom('/pages/listings.html');
    const doc = dom.window.document;
    const hangingFetch = (href) =>
      /header\.html/.test(href) ? new Promise(() => {}) : diskFetch(href);
    const origError = console.error; console.error = () => {};
    let failures;
    try { ({ failures } = await injectIncludes({ doc, urlFor, fetchFn: hangingFetch, timeoutMs: 25 })); }
    finally { console.error = origError; }
    assertEqual(failures.length, 1, 'only the hung partial failed');
    assert(doc.querySelector('.site-header--fallback .brand'), 'minimal brand-only header rendered');
    const alert = doc.querySelector('.shell-error[role="alert"]');
    assert(alert, 'a visible role="alert" strip names the failure');
    assert(alert.textContent.includes('header.html'), 'the strip names WHAT failed');
    assert(alert.querySelector('a[href=""]'), 'same-URL refresh link offered');
    assert(doc.getElementById('nav-drawer'), 'healthy partials still injected');
  });

  test('shell (3.3): a 404 footer leaves a comment + the error strip; header stays real', async () => {
    const dom = new JSDOM(
      '<body><div data-include="components/header.html"></div><div data-include="components/nope.html"></div></body>',
      { url: `${ORIGIN}/index.html` },
    );
    const doc = dom.window.document;
    const origError = console.error; console.error = () => {};
    try { await injectIncludes({ doc, urlFor, fetchFn: diskFetch, timeoutMs: 500 }); }
    finally { console.error = origError; }
    assert(doc.getElementById('nav-toggle'), 'real header injected');
    assert(!doc.querySelector('.site-header--fallback'), 'no fallback when the header succeeded');
    assert(doc.querySelector('.shell-error[role="alert"]'), 'strip still surfaces the footer failure');
  });

  test('shell: normalisePath treats index.html, trailing slash, and bare path as equal', async () => {
    const loc = { origin: ORIGIN, href: `${ORIGIN}/` };
    const a = normalisePath(`${ORIGIN}/index.html`, loc);
    const b = normalisePath(`${ORIGIN}/`, loc);
    const c = normalisePath(ORIGIN, loc);
    assert(a === b && b === c, `all forms normalise identically (${a} | ${b} | ${c})`);
  });

  test('shell: theme applies, persists, and drives the toggle state', async () => {
    const { doc } = await renderShell('/pages/listings.html');
    applyTheme('dark', doc);
    assertEqual(doc.documentElement.getAttribute('data-theme'), 'dark');
    applyTheme(null, doc);
    assert(!doc.documentElement.hasAttribute('data-theme'), 'no attribute = system default');
    const store = new Map();
    const storeApi = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    storeApi.setItem(THEME_KEY, 'dark');
    assertEqual(effectiveTheme({ store: storeApi, prefersDark: () => false }), 'dark', 'saved wins over system');
    const btn = doc.getElementById('theme-toggle');
    updateToggle(btn, { store: storeApi, prefersDark: () => false });
    assertEqual(btn.getAttribute('aria-pressed'), 'true');
    assertEqual(btn.getAttribute('aria-label'), 'Switch to light theme');
  });
}
