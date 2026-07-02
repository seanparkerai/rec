// tests/pages/finances.test.js — DOM-tier pins for step 3.8a: the finances
// page LEADS with the affordability verdict (can/can't at the target price +
// headroom) per the ⚙ 3.1 wireframe and DESIGN.md §5 rule 1. The strip is
// pure composition over the pinned assessAffordability surface — these pins
// lock the markup order and the composition contract, never the numbers
// (those live in the 5.1 golden-master grid).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function financesDom() {
  const html = readFileSync(join(ROOT, 'pages/finances.html'), 'utf8');
  return new JSDOM(html, { url: 'https://example.test/pages/finances.html' });
}

const FIXTURE_FIN = {
  goal: { offerTarget: 375000, targetDeposit: 40000 },
  savings: { totalSavings: 30000 },
  income: { annualBaseSalary: 60000, takeHomeMonthly: 3600, totalMonthly: 3600 },
  mortgage: { ratePctAssumed: 4.5, termYears: 30 },
};

export async function register({ test, assert, assertEqual }) {
  test('finances: the verdict strip leads — above the topic nav, filler lead cut (3.8a)', () => {
    const dom = financesDom();
    const doc = dom.window.document;
    const { Node } = dom.window;
    const strip = doc.getElementById('finance-verdict');
    assert(strip, 'the verdict strip exists');
    assert(strip.hidden, 'server markup ships hidden — JS reveals it only with a real target');
    const toc = doc.querySelector('.finance-toc');
    assert(strip.compareDocumentPosition(toc) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the verdict precedes the topic nav — first-viewport answer');
    assert(!doc.querySelector('.page-head .lead'), 'the filler lead line is gone (3.6c precedent)');
    assert(!doc.querySelector('[style]'), 'no inline styles (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('finances: chart heights are viewport-HEIGHT-keyed; the stale card clamp is dead (3.8c)', () => {
    const dom = financesDom();
    const doc = dom.window.document;
    assert(!doc.querySelector('.chart-tall'), 'the duplicated .chart-tall card clamp no longer has consumers');
    assert(doc.querySelectorAll('.chart-wrap').length >= 4, 'the chart wraps remain the one sizing mechanism');
    for (const file of ['assets/css/pages/finances.css', 'assets/css/pages/finances-charts.css', 'assets/css/dashboard/base.css']) {
      const css = readFileSync(join(ROOT, file), 'utf8');
      assert(!/chart[^\n{]*\{[^}]*\bclamp\([^)]*\dvw\b/.test(css),
        `${file}: no chart height keyed to viewport WIDTH (5.9 — dvh idiom only)`);
    }
    dom.window.close();
  });

  test('finances: the verdict composes the pinned calculator surface — no new maths', async () => {
    const dom = financesDom();
    const doc = dom.window.document;
    globalThis.document = doc;
    const { renderFinanceVerdict } = await import('../../assets/js/finances/section-verdict.js');
    const { assessAffordability } = await import('../../assets/js/affordability.js');
    const { gbp } = await import('../../assets/js/format.js');

    renderFinanceVerdict(FIXTURE_FIN, {});
    const strip = doc.getElementById('finance-verdict');
    assert(!strip.hidden, 'a real target reveals the strip');
    const r = assessAffordability({ price: 375000, finances: FIXTURE_FIN, criteria: {} });
    assert(strip.className.includes(`finance-verdict--${r.verdict}`), 'strip class mirrors the calculator verdict');
    assertEqual(doc.getElementById('finance-verdict-text').textContent, r.headline,
      'the headline IS the calculator headline — no re-derivation');
    const nums = doc.getElementById('finance-verdict-num').textContent;
    assert(nums.includes(gbp(375000)), 'target price rendered');
    assert(nums.includes(gbp(r.monthlyPI)), 'monthly P&I rendered');
    assert(nums.includes(gbp(r.maxPropertyAtTargetDeposit)), 'headroom (max at 4.5x) rendered');
    assert(doc.getElementById('finance-verdict-dot').className.includes(`fit-dot--${r.verdict}`),
      'the fit dot pairs colour with the text verdict (§11: never colour alone)');

    renderFinanceVerdict({}, {});
    assert(strip.hidden, 'no target -> the strip stays hidden (cold-start unchanged)');
    dom.window.close();
  });
}
