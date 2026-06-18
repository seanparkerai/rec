// tile-readiness.js — renders deposit progress headline and stats (savings %, months to
// target, accelerated scenarios), plus the next priority action from the readiness
// checklist. DOM-rendering tile for the home dashboard.
import { getGoals, getReadinessChecklist } from '../storage.js';
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

  let goals, checklist;
  try { goals = await getGoals(); } catch { return; }
  try { checklist = await getReadinessChecklist(); } catch { checklist = []; }
  if (!goals) return;

  // `totalSavings` is the derived cash + earmarked-ISA figure; guard against a
  // missing/NaN value so we never compute a misleading "0% of the way".
  const savedRaw = financesData?.savings?.totalSavings;
  const hasSaved = Number.isFinite(Number(savedRaw));
  const current = hasSaved ? Number(savedRaw) : 0;
  const hoped = Number(goals?.deposit?.hopedFor ?? 0);
  const pct = hoped > 0 ? Math.min(100, Math.round((current / hoped) * 100)) : 0;
  elHeadline.textContent = hoped > 0
    ? (hasSaved
      ? `You're ${pct}% of the way to your ${gbp(hoped)} deposit target.`
      : `Your ${gbp(hoped)} deposit target is set — savings not recorded yet.`)
    : 'Deposit target not set.';

  const monthly = Number(financesData?.savings?.monthlyContribution ?? 0);
  const gap = hoped > 0 ? Math.max(0, hoped - current) : 0;

  function moLabel(mo) {
    if (!Number.isFinite(mo) || mo <= 0) return 'already there';
    return `${Math.ceil(mo)} months`;
  }

  if (elStats) {
    if (!monthly) {
      elStats.innerHTML = `<div><dt>Monthly contribution</dt><dd>not set</dd></div>`;
    } else {
      elStats.innerHTML = `
        <div><dt>At current pace</dt><dd>${moLabel(gap / monthly)}</dd></div>
        <div><dt>At +£500/mo</dt><dd>${moLabel(gap / (monthly + 500))}</dd></div>
        <div><dt>At +£1,000/mo</dt><dd>${moLabel(gap / (monthly + 1000))}</dd></div>`;
    }
  }

  if (elNext) {
    const checkMap = Object.fromEntries((checklist ?? []).map((r) => [r.item_key, r.completed]));
    const nextItem = READINESS_PRIORITY.find((item) => !checkMap[item.key]);
    elNext.textContent = nextItem ? nextItem.label : 'All priority actions done.';
  }
}
