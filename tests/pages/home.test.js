// tests/pages/home.test.js — DOM-tier pins for the Home rebuild (step 3.6,
// Linear-dense; ⚙ 3.1 decision 3: verdict-led, at-a-glance). 3.6a: the lede
// LEADS with the deposit-readiness verdict and the review-count strip stays
// directly beneath as the → Properties action. 3.6b: the bento bands rank
// Act · Money · Track with every tile surviving the re-rank.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function homeDom() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  return new JSDOM(html, { url: 'https://example.test/' });
}

export async function register({ test, assert, assertEqual }) {
  test('home strip: verdict line leads the lede; filler page-head lead is gone; review strip precedes the bento', () => {
    const dom = homeDom();
    const doc = dom.window.document;
    const lede = doc.getElementById('home-lede');
    assertEqual(lede.firstElementChild?.id, 'lede-verdict', 'the verdict is the first element of the strip');
    assert(doc.getElementById('lede-verdict').hidden, 'verdict ships hidden until data renders');
    assert(!doc.getElementById('page-lead'), 'the redundant page-head filler line is cut (fold space)');
    // The → Properties action sits between the strip and the bento, in order.
    const order = [...doc.querySelectorAll('#home-lede, [data-review-count], .bento')];
    assertEqual(order.map((n) => n.id || n.className.split(' ')[0]).join(' → '),
      'home-lede → review-count → bento', 'strip → new-since-last-visit → tiles, in that order');
    dom.window.close();
  });

  test('home verdict: pure depositVerdict maths + render wiring (goals-fed, cold-start safe)', async () => {
    const dom = homeDom();
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    const { depositVerdict, renderLede } = await import('../../assets/js/dashboard/tile-lede.js');
    assertEqual(depositVerdict({ savings: { totalSavings: 12800 } }, { deposit: { hopedFor: 40000 } }),
      'You’re 32% of the way to your £40,000 deposit.');
    assertEqual(depositVerdict({ savings: {} }, { deposit: { hopedFor: 40000 } }),
      'Your £40,000 deposit target is set — savings not recorded yet.');
    assertEqual(depositVerdict({ savings: { totalSavings: 99999 } }, null), null, 'no target → no verdict');
    renderLede({}, {}, { savings: { totalSavings: 20000 } }, { deposit: { hopedFor: 40000 } });
    const v = dom.window.document.getElementById('lede-verdict');
    assert(!v.hidden && /50% of the way/.test(v.textContent), 'verdict renders and unhides');
    assert(dom.window.document.getElementById('home-lede').classList.contains('page-lede--verdict'),
      'prose demotes via the strip modifier class');
    renderLede({}, {}, { savings: { totalSavings: 20000 } }, null);
    assert(v.hidden, 'cold-start (no goals) re-hides the verdict — prose-first fallback');
    dom.window.close();
  });

  test('home bands: Act · Money · Track, every tile surviving under its rank (⚙ 3.1 decision 3)', () => {
    const dom = homeDom();
    const doc = dom.window.document;
    const bands = {};
    let current = null;
    for (const node of doc.querySelectorAll('.bento > *')) {
      if (node.classList.contains('band-label')) { current = node.textContent.trim(); bands[current] = []; }
      else if (current && node.id) bands[current].push(node.id);
    }
    assertEqual(Object.keys(bands).join(' · '), 'Act · Money · Track', 'band ranks per decision 3');
    assertEqual(bands.Act.join(','), 'tile-readiness,tile-journey,tile-ask', 'Act = do-something-now tiles');
    assertEqual(bands.Money.join(','),
      'tile-deposit,tile-afford,tile-scenarios,tile-flow,tile-deposit-risk,tile-networth,tile-scenarios-fan,tile-withdraw-ready',
      'Money = every finance tile, deposit story first');
    assertEqual(bands.Track.join(','), 'tile-shortlist,tile-criteria', 'Track = search-state tiles');
    assertEqual(Object.values(bands).flat().length, 13, 'all 13 tiles survive the re-rank (cut nothing)');
    dom.window.close();
  });
}
