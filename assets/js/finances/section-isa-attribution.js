import { getInvestmentsHistory } from '../storage.js';
import { analysePerformance } from '../investment-performance.js';
import { gbp } from '../format.js';

export async function renderISAAttribution(finData) {
  const el = document.getElementById('isa-attribution');
  if (!el) return;
  let history;
  try { history = await getInvestmentsHistory(); } catch { return; }
  if (!history) return;
  const perf = analysePerformance(history);
  if (perf.isStub) {
    el.innerHTML = '<p class="muted">ISA history not yet imported — run <code>node tools/import-trading212.mjs</code> with your T212 export to see the breakdown.</p>';
    return;
  }
  const total = perf.netContributed + perf.dividendsReceived + perf.interestEarned + Math.max(0, perf.unrealisedGain);
  const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;
  el.innerHTML = `
    <dl class="isa-attribution__grid">
      <dt>Contributed</dt><dd>${gbp(perf.netContributed)} <span class="muted">(${pct(perf.netContributed)}%)</span></dd>
      <dt>Dividends received</dt><dd>${gbp(perf.dividendsReceived)}</dd>
      <dt>Interest</dt><dd>${gbp(perf.interestEarned)}</dd>
      <dt>Market growth (unrealised)</dt><dd>${gbp(Math.max(0, perf.unrealisedGain))}</dd>
      <dt>Total return</dt><dd>${perf.totalReturnPct != null ? perf.totalReturnPct.toFixed(2) + '%' : '—'}</dd>
    </dl>
    <div class="isa-attribution__bar" role="img" aria-label="ISA growth breakdown">
      <div class="isa-attribution__seg isa-attribution__seg--contributed" data-flex="${pct(perf.netContributed)}" title="Contributed ${pct(perf.netContributed)}%"></div>
      <div class="isa-attribution__seg isa-attribution__seg--dividends" data-flex="${pct(perf.dividendsReceived)}" title="Dividends ${pct(perf.dividendsReceived)}%"></div>
      <div class="isa-attribution__seg isa-attribution__seg--interest" data-flex="${pct(perf.interestEarned)}" title="Interest ${pct(perf.interestEarned)}%"></div>
      <div class="isa-attribution__seg isa-attribution__seg--growth" data-flex="${pct(Math.max(0, perf.unrealisedGain))}" title="Growth ${pct(Math.max(0, perf.unrealisedGain))}%"></div>
    </div>`;
  el.querySelectorAll('.isa-attribution__seg[data-flex]').forEach((s) => s.style.setProperty('--seg-flex', s.dataset.flex));
}
