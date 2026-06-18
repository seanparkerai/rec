// tile-affordability.js — interactive affordability ladder visualizing buy-ability bands
// across a price range, with live verdict updates as the user adjusts two price inputs.
// DOM-rendering tile for the home dashboard.
import { assessAffordability } from '../affordability.js';
import { gbp } from '../format.js';
import { esc, byId as $, setText } from '../dom.js';
import { LADDER_RANGE, LADDER_TICKS } from '../intelligence-constants.js';

function findBands(financesData, criteria) {
  const points = [];
  for (let p = LADDER_RANGE.min; p <= LADDER_RANGE.max; p += LADDER_RANGE.step) {
    const v = assessAffordability({ price: p, finances: financesData, criteria }).verdict;
    points.push({ price: p, verdict: v });
  }
  const bands = [];
  let start = points[0].price, current = points[0].verdict;
  for (let i = 1; i < points.length; i++) {
    if (points[i].verdict !== current) {
      bands.push({ verdict: current, start, end: points[i].price });
      current = points[i].verdict;
      start = points[i].price;
    }
  }
  bands.push({ verdict: current, start, end: LADDER_RANGE.max });
  return bands;
}

function buildLadderSVG(bands, loPrice, hiPrice) {
  const w = 300, h = 80;
  const padX = 8, bandY = 22, bandH = 28;
  const innerW = w - 2 * padX;
  const scale = (price) => padX + ((price - LADDER_RANGE.min) / (LADDER_RANGE.max - LADDER_RANGE.min)) * innerW;
  const clamp = (p) => Math.min(LADDER_RANGE.max, Math.max(LADDER_RANGE.min, p));

  let svg = '';
  for (const b of bands) {
    const x = scale(b.start);
    const bw = scale(b.end) - x;
    svg += `<rect class="ladder__band ladder__band--${b.verdict}" x="${x.toFixed(1)}" y="${bandY}" width="${bw.toFixed(1)}" height="${bandH}" />`;
  }

  const lo = clamp(Math.min(loPrice, hiPrice));
  const hi = clamp(Math.max(loPrice, hiPrice));
  const isRange = hi > lo;

  if (isRange) {
    const rx = scale(lo);
    const rw = scale(hi) - rx;
    svg += `<rect class="ladder__range" x="${rx.toFixed(1)}" y="${bandY - 4}" width="${rw.toFixed(1)}" height="${bandH + 8}" rx="3" />`;
  }

  for (const t of LADDER_TICKS) {
    const x = scale(t);
    svg += `<text class="ladder__tick" x="${x.toFixed(1)}" y="${h - 4}" text-anchor="middle">£${(t / 1000).toFixed(0)}k</text>`;
  }

  const drawMarker = (price, anchor) => {
    const mx = scale(clamp(price));
    return `<line class="ladder__marker" x1="${mx.toFixed(1)}" y1="${bandY - 6}" x2="${mx.toFixed(1)}" y2="${bandY + bandH + 6}" />`
      + `<circle class="ladder__marker" cx="${mx.toFixed(1)}" cy="${bandY + bandH + 6}" r="3" />`
      + `<text class="ladder__label" x="${mx.toFixed(1)}" y="${bandY - 10}" text-anchor="${anchor}">${esc(gbp(price))}</text>`;
  };

  if (isRange) {
    svg += drawMarker(lo, 'start');
    svg += drawMarker(hi, 'end');
  } else {
    svg += drawMarker(lo, 'middle');
  }
  return svg;
}

export function renderAffordability(financesData, criteria) {
  const offerTarget = Number(financesData?.goal?.offerTarget || 0);
  const bands = findBands(financesData, criteria);
  const inputA = $('ta-price-a');
  const inputB = $('ta-price-b');
  const verdictLabel = (v) => (v || 'unknown').replace(/-/g, ' ');
  const valid = (n) => Number.isFinite(n) && n >= 100000 && n <= 2000000;

  const update = () => {
    const vals = [Number(inputA?.value), Number(inputB?.value)].filter(valid);
    if (!vals.length) return;
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const svgEl = $('ta-ladder');
    if (svgEl) svgEl.innerHTML = buildLadderSVG(bands, lo, hi);

    const rLo = assessAffordability({ price: lo, finances: financesData, criteria });
    if (hi > lo) {
      const rHi = assessAffordability({ price: hi, finances: financesData, criteria });
      setText('ta-verdict', rLo.verdict === rHi.verdict
        ? `${gbp(lo)}–${gbp(hi)} is ${verdictLabel(rLo.verdict)} across the range.`
        : `${gbp(lo)}–${gbp(hi)}: ${verdictLabel(rLo.verdict)} at the low end, ${verdictLabel(rHi.verdict)} at the top.`);
    } else {
      setText('ta-verdict', rLo.headline);
    }
  };

  const seedLo = Number(criteria?.budget?.min) || offerTarget;
  const seedHi = Number(criteria?.budget?.max) || Math.min(LADDER_RANGE.max, offerTarget + 70000);
  if (inputA && !inputA.value) inputA.value = String(Math.min(seedLo, seedHi));
  if (inputB && !inputB.value) inputB.value = String(Math.max(seedLo, seedHi));

  update();
  [inputA, inputB].forEach((input) => { if (input) input.addEventListener('input', update); });
}
