// search-profiles.test.js — markup + view contract for the Search profiles page.
//
// Reads the real HTML off disk (never fixture markup) and imports only the pure
// view builders — the coordinator pulls in storage.js → supabase-client.js, a CDN
// specifier Node cannot resolve. Same split as tests/pages/listings-browse.test.js.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function pageDom() {
  const html = readFileSync(join(ROOT, 'pages/search-profiles.html'), 'utf8');
  return new JSDOM(html, { url: 'https://example.test/pages/search-profiles.html' });
}

async function loadView(dom) {
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  return import('../../assets/js/page-search-profiles/view.js');
}

const ON = { fetch_enabled: true, legacy_enabled: true, paused_reason: null };
const profile = (over = {}) => ({
  id: 'p1', name: 'Exactly £400,000', enabled: true, admin_paused: false, trigger_mode: 'manual',
  spec: { priceMode: 'exact', price: 400000, minBeds: 2, recencyDays: null, sort: 'oldest', keywords: ['period', 'georgian'] },
  ...over,
});

export async function register({ test, assert, assertEqual }) {
  test('search-profiles page: shell, landmarks and the required hooks', () => {
    const dom = pageDom();
    const doc = dom.window.document;
    assertEqual(doc.documentElement.getAttribute('data-auth-state'), null,
      'the flash guard is set by the blocking script at runtime, not in the markup');
    assert(/data-auth-state','pending'/.test(readFileSync(join(ROOT, 'pages/search-profiles.html'), 'utf8')),
      'the blocking flash-guard script must be first in <head>');
    assert(doc.querySelector('main#main.container'), 'one <main id="main">');
    assert(doc.querySelector('a.skip-link[href="#main"]'), 'skip link first');
    for (const inc of ['components/header.html', 'components/nav.html', 'components/footer.html']) {
      assert(doc.querySelector(`[data-include="${inc}"]`), `${inc} slot present`);
    }
    for (const hook of ['data-profile-list', 'data-profile-empty', 'data-lane-banner', 'data-profile-status']) {
      assert(doc.querySelector(`[${hook}]`), `${hook} hook present`);
    }
    assert(doc.querySelector('[data-profile-status][aria-live="polite"]'), 'status is a polite live region');
    assert(!doc.querySelector('[style]'), 'no inline style attributes (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('search-profiles page: exactly two module scripts, components.js first', () => {
    const dom = pageDom();
    const srcs = [...dom.window.document.querySelectorAll('script[type="module"]')].map((s) => s.getAttribute('src'));
    assertEqual(srcs.length, 2, 'components.js then the coordinator, nothing else');
    assert(/components\.js$/.test(srcs[0]), 'components.js must load first — it injects the shell and runs auth-guard');
    assert(/page-search-profiles\.js$/.test(srcs[1]), 'coordinator second');
    dom.window.close();
  });

  test('search-profiles: the page is reachable from the nav', () => {
    const nav = readFileSync(join(ROOT, 'components/nav.html'), 'utf8');
    assert(/data-nav="pages\/search-profiles\.html"/.test(nav), 'nav entry present');
    assert(!/href="pages\/search-profiles\.html"/.test(nav),
      'nav links use data-nav, never href — setActiveNav() fills the href via config.url()');
  });

  test('search-profiles: a card states its on/off state in TEXT, not colour alone', async () => {
    const dom = pageDom();
    const view = await loadView(dom);
    const on = view.buildProfileCard(profile(), ON);
    assert(/Running/.test(on.querySelector('.sp-card__state').textContent), 'running says so');
    const off = view.buildProfileCard(profile({ enabled: false }), ON);
    assert(/Not running/.test(off.querySelector('.sp-card__state').textContent), 'off says so');
    assertEqual(off.querySelector('.sp-card__state').dataset.state, 'off', 'and exposes it as data, not just class');
    dom.window.close();
  });

  test('search-profiles: a blocked profile says WHY, outermost cause first', async () => {
    const dom = pageDom();
    const view = await loadView(dom);
    // Global off beats every other reason: switching a profile on while searching is
    // globally paused would change nothing, and must not look like it would.
    assertEqual(view.blockedReason(profile(), { fetch_enabled: false }),
      'Searching is switched off for the whole system');
    assertEqual(view.blockedReason(profile(), ON, { search_paused: true }),
      'Searching is paused for your household');
    assertEqual(view.blockedReason(profile({ admin_paused: true }), ON), 'Paused by the administrator');
    assertEqual(view.blockedReason(profile({ enabled: false }), ON), 'Switched off');
    assertEqual(view.blockedReason(profile(), ON), null, 'a runnable profile is not blocked');
    dom.window.close();
  });

  test('search-profiles: Run is disabled with a reason rather than silently inert', async () => {
    const dom = pageDom();
    const view = await loadView(dom);
    const card = view.buildProfileCard(profile(), { fetch_enabled: false });
    const run = card.querySelector('[data-action="run"]');
    assert(run.disabled, 'a press that cannot work must not be pressable');
    assert(/switched off/i.test(run.title), 'and must say why on hover');
    dom.window.close();
  });

  test('search-profiles: only a manual profile gets a Run button', async () => {
    const dom = pageDom();
    const view = await loadView(dom);
    assert(view.buildProfileCard(profile(), ON).querySelector('[data-action="run"]'), 'manual profile can be run');
    assert(!view.buildProfileCard(profile({ trigger_mode: 'schedule' }), ON).querySelector('[data-action="run"]'),
      'a scheduled profile has no Run button — it runs on its own');
    dom.window.close();
  });

  test('search-profiles: an admin-paused profile cannot be toggled by its owner', async () => {
    const dom = pageDom();
    const view = await loadView(dom);
    const card = view.buildProfileCard(profile({ admin_paused: true }), ON);
    assert(card.querySelector('[data-action="toggle"]').disabled,
      'the admin panel is authoritative — the DB trigger would reject the write anyway');
    dom.window.close();
  });

  test('search-profiles: keywords render as text and cannot inject markup', async () => {
    const dom = pageDom();
    const view = await loadView(dom);
    const chips = view.keywordChips(['<img src=x onerror=alert(1)>']);
    assert(!chips.querySelector('img'), 'a keyword is user input — it must never become markup');
    assert(/<img/.test(chips.textContent), 'and is shown verbatim as text');
    const none = view.keywordChips([]);
    assert(/every match is kept/i.test(none.textContent),
      'an empty list must read as "no filter", never as "matches nothing"');
    dom.window.close();
  });

  test('search-profiles: the banner tells the user where the legacy search stands', async () => {
    const dom = pageDom();
    const view = await loadView(dom);
    assert(/still running as well/.test(view.buildLaneBanner(ON).textContent),
      'with legacy on, say the original search continues — profiles are ADDITIONAL');
    assert(/only the searches below/i.test(view.buildLaneBanner({ fetch_enabled: true, legacy_enabled: false }).textContent),
      'with legacy off, say so');
    assert(/whole system/.test(view.buildLaneBanner({ fetch_enabled: false }).textContent),
      'globally off outranks both');
    dom.window.close();
  });

  test('search-profiles: the summary line reads as a person would say it', async () => {
    const dom = pageDom();
    const view = await loadView(dom);
    const s = view.summaryLine(profile().spec);
    assert(/£400,000 exactly/.test(s), 'exact price stated as exact');
    assert(/listed any time/.test(s), 'null recency is a real setting, not a blank');
    assert(/oldest first/.test(s), 'sort is visible');
    assert(/last 24 hours/.test(view.summaryLine({ priceMode: 'exact', price: 375000, recencyDays: 1 })),
      '1 day reads as 24 hours');
    assert(/£300,000 – £425,000/.test(view.summaryLine({ priceMode: 'range', priceMin: 300000, priceMax: 425000 })),
      'a migrated legacy profile still renders its band');
    dom.window.close();
  });
}
