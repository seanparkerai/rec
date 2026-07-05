// tests/contract/intelligence-constants-drift.test.js — step 5.3 (B2): the
// constants-drift rail. `intelligence-constants.js` is the single source of
// truth for the affordability/fit rule numbers, and `docs/INTELLIGENCE_RULES.md`
// documents the SAME numbers in prose — a dual-source risk (§10.3): edit one,
// forget the other, and the app quietly disagrees with its own documentation.
// This rail parses the doc's literals and fails on ANY skew. A regex that no
// longer matches fails loudly too ("doc structure changed — update the rail"),
// never silently skips.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LTI_BANDS, PAYMENT_BANDS_PCT, SPARE_BANDS_GBP, LISA_CAP_GBP, LTV_TIERS,
  RATE_RISE_UPLIFT_PP, RATE_RISE_FLOOR_PCT, MGS_LTV_MIN_PCT, MGS_LTV_MAX_PCT,
  MGS_PRICE_CAP_GBP, FIT_BANDS, FIT_WEIGHTS,
} from '../../assets/js/intelligence-constants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const doc = readFileSync(join(ROOT, 'docs/INTELLIGENCE_RULES.md'), 'utf8');

/** Match or die loudly — a silent non-match would let drift through unseen. */
function grab(re, what) {
  const m = doc.match(re);
  if (!m) throw new Error(`drift rail can't find ${what} in INTELLIGENCE_RULES.md — doc structure changed; update the rail WITH the doc`);
  return m;
}
const num = (s) => parseFloat(String(s).replace(/,/g, ''));

export async function register({ test, assertEqual }) {
  test('constants drift (5.3): LTI / payment / spare band tables match the code', () => {
    for (const [band, want] of Object.entries(LTI_BANDS)) {
      const m = grab(new RegExp(`\\|\\s*${band}\\s*\\|\\s*≤\\s*([\\d.]+)×`), `LTI ${band}`);
      assertEqual(num(m[1]), want, `LTI_BANDS.${band}: doc says ${m[1]}×, code says ${want}×`);
    }
    for (const [band, want] of Object.entries(PAYMENT_BANDS_PCT)) {
      const m = grab(new RegExp(`\\|\\s*${band}\\s*\\|\\s*≤\\s*([\\d.]+)%`), `payment ${band}`);
      assertEqual(num(m[1]), want, `PAYMENT_BANDS_PCT.${band}: doc says ${m[1]}%, code says ${want}%`);
    }
    for (const [band, want] of Object.entries(SPARE_BANDS_GBP)) {
      const m = grab(new RegExp(`\\|\\s*${band}\\s*\\|\\s*≥\\s*£([\\d,]+)`), `spare ${band}`);
      assertEqual(num(m[1]), want, `SPARE_BANDS_GBP.${band}: doc says £${m[1]}, code says £${want}`);
    }
  });

  test('constants drift (5.3): LISA cap, LTV tiers, rate-rise sensitivity match the code', () => {
    const lisa = grab(/purchase price \*\*≤ £([\d,]+)\*\*/, 'the LISA cap');
    assertEqual(num(lisa[1]), LISA_CAP_GBP, `LISA cap: doc £${lisa[1]}, code £${LISA_CAP_GBP}`);
    const ltv = grab(/\*\*(\d+)% · (\d+)% · (\d+)% · (\d+)% · (\d+)%\*\*/, 'the LTV tier list');
    assertEqual(JSON.stringify(ltv.slice(1, 6).map(num)), JSON.stringify(LTV_TIERS),
      'LTV_TIERS: the doc tier list diverged from the code');
    const rise = grab(/Sensitivity rate = max\(assumed rate \+ ([\d.]+) percentage points?, ([\d.]+)% absolute floor\)/,
      'the rate-rise sensitivity rule');
    assertEqual(num(rise[1]), RATE_RISE_UPLIFT_PP, `RATE_RISE_UPLIFT_PP: doc +${rise[1]}pp, code +${RATE_RISE_UPLIFT_PP}pp`);
    assertEqual(num(rise[2]), RATE_RISE_FLOOR_PCT, `RATE_RISE_FLOOR_PCT: doc ${rise[2]}%, code ${RATE_RISE_FLOOR_PCT}%`);
    const mgs = grab(/MGS window = (\d+)% to (\d+)% LTV, price cap £([\d,]+)/, 'the MGS window');
    assertEqual(num(mgs[1]), MGS_LTV_MIN_PCT, `MGS_LTV_MIN_PCT: doc ${mgs[1]}%, code ${MGS_LTV_MIN_PCT}%`);
    assertEqual(num(mgs[2]), MGS_LTV_MAX_PCT, `MGS_LTV_MAX_PCT: doc ${mgs[2]}%, code ${MGS_LTV_MAX_PCT}%`);
    assertEqual(num(mgs[3]), MGS_PRICE_CAP_GBP, `MGS_PRICE_CAP_GBP: doc £${mgs[3]}, code £${MGS_PRICE_CAP_GBP}`);
  });

  test('constants drift (5.3): FIT_BANDS + FIT_WEIGHTS match the code', () => {
    const bands = grab(/strong ≥ ([\d.]+) · possible ≥ ([\d.]+) · stretch ≥ ([\d.]+) ·\s*\n?weak ≥ ([\d.]+)/,
      'the FIT_BANDS line');
    for (const [i, band] of ['strong', 'possible', 'stretch', 'weak'].entries()) {
      assertEqual(num(bands[i + 1]), FIT_BANDS[band], `FIT_BANDS.${band}: doc ${bands[i + 1]}, code ${FIT_BANDS[band]}`);
    }
    const w = grab(/affordability comfortable \+([\d.]+) \/ stretch \+([\d.]+) \/ tight (-[\d.]+) · beds ideal \+([\d.]+) \/ min \+([\d.]+) \/\s*\n?below-min (-[\d.]+) · type preferred \+([\d.]+) \/ acceptable (\d+) \/ excluded (-[\d.]+) · price in-budget \+([\d.]+) \/\s*\n?over-budget (-[\d.]+) · LISA-eligible \+([\d.]+) · EPC meets min \+([\d.]+)/,
      'the FIT_WEIGHTS paragraph');
    const wants = [
      ['affordabilityComfortable', w[1]], ['affordabilityStretch', w[2]], ['affordabilityTight', w[3]],
      ['bedsIdeal', w[4]], ['bedsMin', w[5]], ['bedsBelowMin', w[6]],
      ['typePreferred', w[7]], ['typeAcceptable', w[8]], ['typeExcluded', w[9]],
      ['priceInBudget', w[10]], ['priceOverBudget', w[11]],
      ['lisaEligible', w[12]], ['epcMeetsMin', w[13]],
    ];
    for (const [key, docVal] of wants) {
      assertEqual(num(docVal), FIT_WEIGHTS[key], `FIT_WEIGHTS.${key}: doc ${docVal}, code ${FIT_WEIGHTS[key]}`);
    }
    // 2026-07-05: the ranked type feed order's graded weight has its own doc paragraph.
    const tp = grab(/Type feed order \(`typePriorityMax` ±([\d.]+)/, 'the typePriorityMax paragraph');
    assertEqual(num(tp[1]), FIT_WEIGHTS.typePriorityMax, `FIT_WEIGHTS.typePriorityMax: doc ${tp[1]}, code ${FIT_WEIGHTS.typePriorityMax}`);
  });
}
