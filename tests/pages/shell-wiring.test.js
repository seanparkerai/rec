// tests/pages/shell-wiring.test.js — the extracted shell wiring (step 3.3b):
// shell/theme.js, shell/nav-drawer.js, shell/header-user.js exercised against
// the REAL injected partials under jsdom. jsdom implements no <dialog>
// internals (showModal/close/open), so those are shimmed per test — the unit
// under test is OUR wiring (listeners, aria mirroring, persistence, reveals),
// not the browser's dialog machinery.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { injectIncludes, THEME_KEY } from '../../assets/js/shell-core.js';
import { initTheme } from '../../assets/js/shell/theme.js';
import { initNavDrawer } from '../../assets/js/shell/nav-drawer.js';
import { initHeaderUser } from '../../assets/js/shell/header-user.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://example.test';
const urlFor = (p) => new URL(String(p).replace(/^\/+/, ''), `${ORIGIN}/`).href;
const diskFetch = async (href) => {
  const pathname = new URL(href).pathname.replace(/^\//, '');
  try {
    const text = readFileSync(join(ROOT, pathname), 'utf8');
    return { ok: true, status: 200, text: async () => text };
  } catch {
    return { ok: false, status: 404, text: async () => '' };
  }
};

async function shell() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div data-include="components/header.html"></div>
    <div data-include="components/nav.html"></div>
    <main id="main"></main>
  </body></html>`, { url: `${ORIGIN}/index.html` });
  const doc = dom.window.document;
  await injectIncludes({ doc, urlFor, fetchFn: diskFetch });
  return { dom, doc };
}

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), _m: m };
};

export async function register({ test, assert, assertEqual }) {
  test('wiring: theme toggle click flips theme, persists it, and mirrors button state', async () => {
    const { doc } = await shell();
    const store = memStore();
    initTheme({ doc, store, prefersDark: () => false });
    const btn = doc.getElementById('theme-toggle');
    assertEqual(btn.getAttribute('aria-pressed'), 'false', 'starts light (system light, nothing saved)');
    btn.click();
    assertEqual(doc.documentElement.getAttribute('data-theme'), 'dark', 'html attribute set');
    assertEqual(store.getItem(THEME_KEY), 'dark', 'preference persisted');
    assertEqual(btn.getAttribute('aria-pressed'), 'true', 'button mirrors dark');
    btn.click();
    assertEqual(doc.documentElement.getAttribute('data-theme'), 'light', 'flips back');
    assertEqual(store.getItem(THEME_KEY), 'light');
  });

  test('wiring: burger opens the drawer, close button + nav link close it, aria-expanded mirrors', async () => {
    const { dom, doc } = await shell();
    const dialog = doc.getElementById('nav-drawer');
    // jsdom has no dialog internals — shim the contract our wiring calls.
    Object.defineProperty(dialog, 'open', { get() { return this.hasAttribute('open'); }, configurable: true });
    dialog.showModal = function () { this.setAttribute('open', ''); };
    dialog.close = function () {
      this.removeAttribute('open');
      this.dispatchEvent(new dom.window.Event('close'));
    };
    initNavDrawer({ doc });
    const burger = doc.getElementById('nav-toggle');
    burger.click();
    assert(dialog.open, 'burger opens the drawer');
    assertEqual(burger.getAttribute('aria-expanded'), 'true', 'burger reflects open');
    doc.getElementById('nav-drawer-close').click();
    assert(!dialog.open, 'close button closes');
    assertEqual(burger.getAttribute('aria-expanded'), 'false', 'burger reflects closed');
    burger.click();
    doc.querySelector('#nav-drawer a[data-nav]').click();
    assert(!dialog.open, 'any nav link click closes the drawer');
  });

  test('wiring: header-user paints the email, reveals admin nav, and signs out via injected auth', async () => {
    const { doc } = await shell();
    let signedOut = false;
    let navigatedTo = null;
    await initHeaderUser({
      doc,
      getUser: async () => ({ email: 'admin@gr.com' }),
      doSignOut: async () => { signedOut = true; },
      navigate: (href) => { navigatedTo = href; },
      urlFor,
    });
    const userEl = doc.getElementById('header-user');
    assertEqual(userEl.textContent, 'admin@gr.com');
    assertEqual(userEl.hidden, false, 'email revealed');
    assert([...doc.querySelectorAll('[data-admin-only]')].every((el) => !el.hidden),
      'admin-only nav entries revealed for the admin account');
    const btn = doc.getElementById('btn-sign-out');
    assertEqual(btn.hidden, false, 'sign-out revealed');
    btn.click();
    await new Promise((r) => setTimeout(r, 0)); // let the async click handler run
    assert(signedOut, 'sign-out called through the injected auth');
    assertEqual(navigatedTo, urlFor('pages/login.html'), 'navigates to login');
  });

  test('wiring: a signed-out shell stays quiet (no reveal, no crash)', async () => {
    const { doc } = await shell();
    await initHeaderUser({
      doc, getUser: async () => null, doSignOut: async () => {}, navigate: () => {}, urlFor,
    });
    assertEqual(doc.getElementById('header-user').hidden, true, 'email stays hidden');
    assertEqual(doc.getElementById('btn-sign-out').hidden, true, 'sign-out stays hidden');
  });
}
