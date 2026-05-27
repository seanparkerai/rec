import { loadJSON } from '../data-loader.js';
import { gbp } from '../format.js';

const READINESS_PRIORITY = [
  { key: 'experianChecked',              label: 'Check your Experian credit score' },
  { key: 'equifaxChecked',               label: 'Check your Equifax credit score' },
  { key: 'transUnionChecked',            label: 'Check your TransUnion credit score' },
  { key: 'electoralRollRegistered',      label: 'Register on the electoral roll' },
  { key: 'mortgageBrokerConversation',   label: 'Speak to a mortgage broker' },
  { key: 'agreementInPrincipleObtained', label: 'Get an Agreement in Principle' },
  { key: 'conveyancerIdentified',        label: 'Identify a conveyancer' },
];

export async function renderReadinessTile(financesData) {
  const elHeadline = document.getElementById('readiness-headline');
  const elStats = document.getElementById('readiness-stats');
  const elNext = document.getElementById('readiness-next-text');
  if (!elHeadline) return;

  let goals;
  try { goals = await loadJSON('goals'); } catch { return; }

  const current = Number(goals?.deposit?.currentSavings ?? financesData?.savings?.totalSavings ?? 0);
  const hoped = Number(goals?.deposit?.hopedFor ?? 50_000);
  const pct = hoped > 0 ? Math.min(100, Math.round((current / hoped) * 100)) : 0;
  if (elHeadline) {
    elHeadline.textContent = `You're ${pct}% of the way to your hoped-for ${gbp(hoped)} deposit.`;
  }

  const monthly = Number(financesData?.savings?.monthlyContribution ?? 2000);
  const gap = Math.max(0, hoped - current);

  function moLabel(mo) {
    if (!Number.isFinite(mo) || mo <= 0) return 'already there';
    return `${Math.ceil(mo)} months`;
  }

  if (elStats) {
    elStats.innerHTML = `
      <div><dt>At current pace</dt><dd>${moLabel(monthly > 0 ? gap / monthly : Infinity)}</dd></div>
      <div><dt>At +£500/mo</dt><dd>${moLabel((monthly + 500) > 0 ? gap / (monthly + 500) : Infinity)}</dd></div>
      <div><dt>At +£1,000/mo</dt><dd>${moLabel((monthly + 1000) > 0 ? gap / (monthly + 1000) : Infinity)}</dd></div>`;
  }

  if (elNext) {
    const checklist = goals?.readiness?.checklist ?? {};
    const nextItem = READINESS_PRIORITY.find((item) => !checklist[item.key]);
    elNext.textContent = nextItem ? nextItem.label : 'All priority actions done.';
  }
}
