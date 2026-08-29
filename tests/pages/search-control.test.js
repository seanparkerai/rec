// search-control.test.js — markup + view contract for the admin search panel.
//
// The panel's job is to answer "what is actually running right now?" without the
// admin having to reason about five interacting switches. The assertions below are
// mostly about that: a profile marked on inside a paused household is NOT running,
// and a panel that showed it as on would be lying about the system.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE = join(ROOT, 'live-feed/search-control.html');

function pageDom() {
  return new JSDOM(readFileSync(PAGE, 'utf8'), { url: 'https://example.test/live-feed/search-control.html' });
}
async function loadView(dom) {
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  return import('../../assets/js/page-search-control/view.js');
}

const ON = { fetch_enabled: true, legacy_enabled: true, paused_reason: null };
const prof = (o = {}) => ({ id: 'p1', name: 'Exactly £400,000', enabled: true, admin_paused: false, trigger_mode: 'manual', spec: { priceMode: 'exact', price: 400000, recencyDays: null, sort: 'oldest', keywords: ['period'] }, ...o });
const hh = (o = {}) => ({ id: 'h1', name: 'My Household', search_paused: false, active_areas: 185, profiles: [prof()], ...o });

export async function register({ test, assert, assertEqual }) {
  test('search-control: kiosk shell, noindex, and no nav chrome', () => {
    const dom = pageDom();
    const doc = dom.window.document;
    const raw = readFileSync(PAGE, 'utf8');
    assert(/data-auth-state','pending'/.test(raw), 'blocking flash guard first in <head>');
    assert(doc.querySelector('meta[name="robots"][content="noindex"]'), 'admin kiosk must be noindex');
    assert(doc.querySelector('main#main'), 'one <main id="main">');
    assert(!doc.querySelector('[data-include]'), 'kiosk pages carry no header/nav/footer includes');
    assert(!doc.querySelector('[style]'), 'no inline style attributes (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('search-control: lives UNDER /live-feed so the existing admin lock covers it', () => {
    // auth-guard.js gates on here.includes('/live-feed'), so this page needs no
    // change to the lock. If it ever moves out of this directory, the admin would
    // be redirected away from their own control panel.
    assert(PAGE.includes('live-feed'), 'the page must stay under live-feed/');
    const guard = readFileSync(join(ROOT, 'assets/js/auth-guard.js'), 'utf8');
    assert(/const LIVE_FEED = '\/live-feed'/.test(guard) && /here\.includes\(LIVE_FEED\)/.test(guard),
      'the lock is a path prefix check — this page relies on that, so it must not become an exact match');
  });

  test('search-control: components.js loads so the admin lock and theme still run', () => {
    const dom = pageDom();
    const srcs = [...dom.window.document.querySelectorAll('script[type="module"]')].map((s) => s.getAttribute('src'));
    assert(/components\.js$/.test(srcs[0]), 'components.js first — it runs auth-guard.js');
    assert(/page-search-control\.js$/.test(srcs[1]), 'coordinator second');
    dom.window.close();
  });

  test('search-control: effective state accounts for EVERY switch above a profile', async () => {
    const dom = pageDom();
    const v = await loadView(dom);
    assertEqual(v.effectiveState(prof(), hh(), ON).label, 'Running');
    assertEqual(v.effectiveState(prof(), hh(), { fetch_enabled: false }).label, 'Global off');
    assertEqual(v.effectiveState(prof(), hh({ search_paused: true }), ON).label, 'User paused');
    assertEqual(v.effectiveState(prof({ admin_paused: true }), hh(), ON).label, 'Admin paused');
    assertEqual(v.effectiveState(prof({ enabled: false }), hh(), ON).label, 'User off');
    dom.window.close();
  });

  test('search-control: a profile switched ON inside a paused household reads as NOT running', async () => {
    // The trap this guards: showing the profile's own flag instead of the outcome.
    const dom = pageDom();
    const v = await loadView(dom);
    const st = v.effectiveState(prof({ enabled: true }), hh({ search_paused: true }), ON);
    assert(!st.running, 'its own switch being on does not make it run');
    dom.window.close();
  });

  test('search-control: the summary counts what is REALLY running', async () => {
    const dom = pageDom();
    const v = await loadView(dom);
    const households = [hh({ profiles: [prof(), prof({ id: 'p2', enabled: false })] })];
    assertEqual(v.buildSummary(households, ON).dataset.runningCount, '1', '1 of 2 running');
    assertEqual(v.buildSummary(households, { fetch_enabled: false }).dataset.runningCount, '0',
      'globally off means nothing is running, whatever the individual flags say');
    dom.window.close();
  });

  test('search-control: the two global switches are described as independent', async () => {
    const dom = pageDom();
    const v = await loadView(dom);
    const txt = v.buildGlobalControls(ON).textContent;
    assert(/both lanes may run/.test(txt), 'the master switch names both lanes');
    assert(/Independent of the profile lane/.test(txt),
      'the legacy switch must say it is independent — confusing the two is the expensive mistake');
    assert(/does not delete anything/.test(txt), 'and that it is reversible');
    const off = v.buildGlobalControls({ fetch_enabled: true, legacy_enabled: false }).textContent;
    assert(/only profiles run/.test(off), 'legacy off is stated as a consequence, not a flag');
    dom.window.close();
  });

  test('search-control: state is text, not colour alone', async () => {
    const dom = pageDom();
    const v = await loadView(dom);
    const row = v.buildProfileRow(prof({ enabled: false }), hh(), ON);
    const cell = row.querySelector('.sc-state');
    assertEqual(cell.dataset.running, 'no', 'exposed as data');
    assert(cell.textContent.trim().length > 0, 'and as words (CLAUDE.md §11)');
    dom.window.close();
  });

  test('search-control: a paused household says its profiles are inactive regardless', async () => {
    const dom = pageDom();
    const v = await loadView(dom);
    const block = v.buildHouseholdBlock(hh({ search_paused: true }), ON);
    assert(/regardless of its own switch/.test(block.textContent),
      'the admin must not have to infer that the household pause overrides the profile switch');
    dom.window.close();
  });

  test('search-control: no window.confirm anywhere — native <dialog> only', () => {
    // CLAUDE.md §11 bans window.confirm/alert/prompt in production UI.
    const coord = readFileSync(join(ROOT, 'assets/js/page-search-control.js'), 'utf8');
    assert(!/(^|[^.\w])confirm\s*\(/.test(coord.replace(/confirmDialog\s*\(/g, '')),
      'use confirmDialog(), never window.confirm');
    assert(/confirmDialog/.test(coord), 'stopping everything must ask first');
  });

  test('search-control: the shared confirm resolves false on dismissal, not true', async () => {
    // An interrupted gesture must never read as consent.
    const src = readFileSync(join(ROOT, 'assets/js/confirm-dialog.js'), 'utf8');
    assert(/addEventListener\('cancel'.*done\(false\)/s.test(src), 'Escape resolves false');
    assert(/addEventListener\('close'.*done\(false\)/s.test(src), 'backdrop/close resolves false');
    assert(/if \(settled\) return;/.test(src), 'and close() firing after resolve must not re-enter');
  });
}
