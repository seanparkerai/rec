// tile-lede.js — renders the verdict-led strip (3.6a): the deposit-readiness
// verdict first, then the search-description prose and the key metrics bar
// (budget, deposit, beds, moving window) from profile, criteria, and finances.
// DOM-rendering tile for the home dashboard.
import { gbp } from '../format.js';
import { byId as $, setText } from '../dom.js';
import { normalizeProfile } from '../profile-schema.js';

/**
 * The one-line readiness verdict the home page leads with (decision 3): same
 * maths as the readiness tile's headline — derived savings vs the hoped-for
 * deposit — expressed as the at-a-glance answer. Pure; null when no target is
 * set (the strip then falls back to prose-first, exactly as before 3.6a).
 */
export function depositVerdict(financesData, goals) {
  const hoped = Number(goals?.deposit?.hopedFor ?? 0);
  if (!(hoped > 0)) return null;
  const savedRaw = financesData?.savings?.totalSavings;
  if (!Number.isFinite(Number(savedRaw))) {
    return `Your ${gbp(hoped)} deposit target is set — savings not recorded yet.`;
  }
  const pct = Math.min(100, Math.round((Number(savedRaw) / hoped) * 100));
  return `You’re ${pct}% of the way to your ${gbp(hoped)} deposit.`;
}

export function renderLede(rawProfile, criteria, financesData, goals = null) {
  // Verdict first (3.6a): when a deposit target exists, the strip leads with
  // the readiness answer and the descriptive prose demotes to the second line.
  const verdictEl = $('lede-verdict');
  const verdict = depositVerdict(financesData, goals);
  if (verdictEl) {
    verdictEl.hidden = !verdict;
    verdictEl.textContent = verdict || '';
    $('home-lede')?.classList.toggle('page-lede--verdict', !!verdict);
  }

  // Normalise first so headline/locationFocus/movingTimeline resolve from any
  // historical profile shape (flat/nested/summary) — never read as empty.
  const profile = normalizeProfile(rawProfile);
  const max = criteria?.budget?.max || 0;
  const dep = financesData?.goal?.targetDeposit || 0;
  const beds = criteria?.size?.minBeds;
  const ideal = criteria?.size?.idealBeds;
  const win = financesData?.goal?.movingWindow || profile?.movingTimeline;
  setText('lede-budget', max ? gbp(max) : '—');
  setText('lede-deposit', dep ? gbp(dep) : '—');
  setText('lede-beds', beds ? (ideal && ideal > beds ? `${beds}–${ideal}` : String(beds)) : '—');
  setText('lede-window', win || '—');

  const lede = $('lede-prose');
  if (!lede) return;
  if (profile?.headline) { lede.textContent = profile.headline; return; }
  const pref = criteria?.propertyTypePrefs?.preferred?.slice(0, 2).join(' or ');
  const loc = profile?.locationFocus || 'Hampshire & Wiltshire';
  const parts = [`Looking for ${pref ? `a ${pref}` : 'a home'} in ${loc}`];
  if (beds) parts.push(`${ideal && ideal > beds ? `${beds}–${ideal}` : beds}-bed`);
  if (max) parts.push(`around ${gbp(max)}`);
  if (dep) parts.push(`with a ${gbp(dep)} deposit target`);
  lede.textContent = parts.join(' · ') + '.';
}
