// tile-lede.js — renders hero paragraph and key metrics bar (budget, deposit, beds,
// moving window) from profile, criteria, and finances. DOM-rendering tile for the
// home dashboard.
import { gbp } from '../format.js';
import { byId as $, setText } from '../dom.js';
import { normalizeProfile } from '../profile-schema.js';

export function renderLede(rawProfile, criteria, financesData) {
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
