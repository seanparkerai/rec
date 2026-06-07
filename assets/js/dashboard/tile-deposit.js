import * as fin from '../finances.js';
import { gbp, monthsAsDuration } from '../format.js';
import { getMoneyFlow } from '../money-flow.js';
import { esc, byId as $, setText, setHTML } from '../dom.js';

const SCENARIO_DELTAS = {
  baseline: { deltaMonthly: 0,    lumpSum: 0    },
  '+200':   { deltaMonthly: 200,  lumpSum: 0    },
  '+500':   { deltaMonthly: 500,  lumpSum: 0    },
  '+5k':    { deltaMonthly: 0,    lumpSum: 5000 },
};

const MINI_FLOW_COLORS = {
  Bills:    'color-mix(in oklch, var(--ink) 14%, var(--paper))',
  Expenses: 'color-mix(in oklch, var(--ink) 28%, var(--paper))',
  Savings:  'color-mix(in oklch, var(--accent) 35%, var(--paper))',
  Spare:    'color-mix(in oklch, var(--accent) 14%, var(--paper))',
};

function setRing(pct) {
  const bar = $('td-ring-bar');
  if (!bar) return;
  const offset = 100 - Math.min(Math.max(0, pct), 100);
  requestAnimationFrame(() => { bar.style.strokeDashoffset = String(offset); });
}

function applyDepositScenario(base, scenarioKey) {
  const delta = SCENARIO_DELTAS[scenarioKey] || SCENARIO_DELTAS.baseline;
  const saved = base.saved + delta.lumpSum;
  const monthly = base.monthly + delta.deltaMonthly;
  const target = base.target;
  const pct = fin.calcDepositProgress(saved, target);
  const monthsTo = fin.calcMonthsToTarget(saved, target, monthly);

  setText('td-saved', gbp(saved));
  setText('td-target', gbp(target));
  setText('td-monthly', `${gbp(monthly)} goal`);
  const avgMo = base.avgMonthly;
  setText('td-monthly-avg', Number.isFinite(avgMo) && avgMo > 0 ? `${gbp(avgMo)} avg` : '');
  setText('td-ring-pct', String(pct));
  setText('td-headline', `${gbp(saved)} / ${gbp(target)}`);
  setRing(pct);

  const etaEl = $('td-eta');
  if (!etaEl) return;
  if (!Number.isFinite(monthsTo) || target === 0) {
    etaEl.textContent = base.window ? `Moving window: ${base.window}` : 'Set a deposit target on the Finances page.';
    return;
  }
  const eta = new Date();
  eta.setMonth(eta.getMonth() + Math.round(monthsTo));
  const etaLabel = eta.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  etaEl.innerHTML = `Target in <strong>${esc(monthsAsDuration(monthsTo))}</strong> · ${etaLabel}` +
                    (base.window ? ` · window <strong>${esc(base.window)}</strong>` : '');
}

function renderMiniFlow(financesData) {
  const flow = getMoneyFlow(financesData);
  const total = Math.max(1, flow.income.total || 0);
  const order = ['Bills', 'Expenses', 'Savings', 'Spare'];

  setHTML('td-flow', order.map((name) => {
    const b = flow.buckets.find((x) => x.name === name);
    if (!b || b.amount <= 0) return '';
    const w = (b.amount / total) * 100;
    return `<span data-w="${w.toFixed(2)}" data-c="${MINI_FLOW_COLORS[name]}" title="${esc(name)}: ${gbp(b.amount)}"></span>`;
  }).join(''));
  $('td-flow')?.querySelectorAll('span[data-w]').forEach((s) => {
    s.style.setProperty('--seg-w', `${s.dataset.w}%`);
    s.style.setProperty('--seg-c', s.dataset.c);
  });

  setHTML('td-flow-legend', order.map((name) => {
    const b = flow.buckets.find((x) => x.name === name);
    if (!b) return '';
    return `<li><span class="swatch" data-c="${MINI_FLOW_COLORS[name]}" aria-hidden="true"></span>${esc(name)}<strong>${gbp(b.amount)}</strong></li>`;
  }).join(''));
  $('td-flow-legend')?.querySelectorAll('.swatch[data-c]').forEach((s) => {
    s.style.setProperty('--seg-c', s.dataset.c);
  });
}

export function renderDeposit(financesData) {
  const base = {
    saved:   Number(financesData?.savings?.totalSavings ?? financesData?.savings?.current ?? 0),
    monthly: Number(financesData?.savings?.monthlyContribution || 0),
    avgMonthly: Number(financesData?.savings?.avgMonthlyDepositEstimate || 0),
    target:  Number(financesData?.goal?.targetDeposit || 0),
    window:  financesData?.goal?.movingWindow,
  };

  applyDepositScenario(base, 'baseline');
  renderMiniFlow(financesData);

  document.querySelectorAll('.scenario-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.scenario;
      if (!SCENARIO_DELTAS[key]) return;
      document.querySelectorAll('.scenario-chip').forEach((c) => {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      applyDepositScenario(base, key);
    });
  });
}
