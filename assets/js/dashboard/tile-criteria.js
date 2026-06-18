// tile-criteria.js — renders search criteria as prose and a spec strip (beds, budget,
// deposit, EPC, tenure, moving window). DOM-rendering tile for the home dashboard.
import { gbp } from '../format.js';
import { esc, byId as $, setText, setHTML } from '../dom.js';

function buildCriteriaProse(criteria, profile) {
  if (!criteria) return '—';
  const pref = criteria.propertyTypePrefs?.preferred?.slice(0, 2).join(' or ');
  const beds = criteria.size?.minBeds;
  const ideal = criteria.size?.idealBeds;
  const bedsStr = beds ? (ideal && ideal > beds ? `${beds}–${ideal}-bed ` : `${beds}-bed `) : '';
  const tenure = criteria.tenure?.preferred?.[0]?.toLowerCase() || criteria.tenurePref || '';
  const tenureStr = tenure ? `${tenure} ` : '';
  const loc = profile?.locationFocus || 'Hampshire & Wiltshire';
  const min = criteria.budget?.min;
  const max = criteria.budget?.max;
  const budgetStr = (min && max) ? `${gbp(min)}–${gbp(max)}` : (max ? `up to ${gbp(max)}` : '');
  const epc = criteria.epcMin ? `EPC ${criteria.epcMin}+` : '';
  const must = (criteria.features?.mustHave || []).map((s) => s.toLowerCase());
  const mustStr = must.length ? `with ${must.slice(0, 2).join(' and ')}` : '';
  const excludes = (criteria.tenure?.excluded || []).map((s) => s.toLowerCase());
  const excludesStr = excludes.length ? ` Avoiding ${excludes.slice(0, 2).join(' and ')}.` : '';

  const head = `Looking for a ${tenureStr}${bedsStr}${pref || 'home'} in ${loc}`;
  const tail = [budgetStr, epc, mustStr].filter(Boolean).join(', ');
  return `${head}${tail ? ', ' + tail : ''}.${excludesStr}`;
}

function buildSpecStrip(criteria, financesData) {
  const beds = criteria?.size?.minBeds;
  const ideal = criteria?.size?.idealBeds;
  const bedsStr = beds ? (ideal && ideal > beds ? `${beds}–${ideal}` : String(beds)) : '—';
  const min = criteria?.budget?.min, max = criteria?.budget?.max;
  const budgetStr = (min && max) ? `${gbp(min)}–${gbp(max)}` : (max ? gbp(max) : '—');
  const dep = financesData?.goal?.targetDeposit;
  const epc = criteria?.epcMin || '—';
  const tenure = criteria?.tenure?.preferred?.[0] || '—';
  const win = financesData?.goal?.movingWindow || '—';

  return [
    ['Beds', bedsStr],
    ['Budget', budgetStr],
    ['Deposit', dep ? gbp(dep) : '—'],
    ['EPC', epc],
    ['Tenure', tenure],
    ['Window', win],
  ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
}

export function renderCriteriaProse(criteria, profile, financesData) {
  setText('tc-prose', buildCriteriaProse(criteria, profile));
  setHTML('tc-strip', buildSpecStrip(criteria, financesData));
}
