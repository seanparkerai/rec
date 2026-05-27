import { loadJSON } from '../data-loader.js';
import { analysePerformance } from '../investment-performance.js';
import { gbp } from '../format.js';

export async function renderISAYTD() {
  const el = document.getElementById('isa-ytd-stat');
  if (!el) return;
  try {
    const history = await loadJSON('imports/trading212-history');
    const perf = analysePerformance(history);
    if (perf.isStub) { el.textContent = '—'; return; }
    const year = new Date().getFullYear().toString();
    const ytd = (history.monthlySummary ?? [])
      .filter((m) => m.month.startsWith(year))
      .reduce((s, m) => s + (Number(m.net) || 0), 0);
    el.textContent = gbp(ytd);
  } catch { el.textContent = '—'; }
}
