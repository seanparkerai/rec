import { assessAffordability } from '../affordability.js';
import { gbp } from '../format.js';
import { getShortlist, getHouseholdAreas } from '../storage.js';
import { esc, byId as $, setText } from '../dom.js';

function fitDotClass(verdict) {
  if (verdict === 'comfortable') return 'fit-dot fit-dot--comfortable';
  if (verdict === 'stretch')     return 'fit-dot fit-dot--stretch';
  if (verdict === 'tight')       return 'fit-dot fit-dot--tight';
  if (verdict === 'out-of-reach') return 'fit-dot fit-dot--out-of-reach';
  return 'fit-dot fit-dot--unknown';
}

function priceFor(area) {
  return area?.prices?.avg3Bed
      ?? area?.prices?.avgDetached
      ?? area?.prices?.avgSemi
      ?? area?.prices?.median
      ?? null;
}

export async function renderShortlist(financesData, criteria) {
  try {
    const shortlist = await getShortlist();
    const areas = await getHouseholdAreas();
    const items = shortlist.length
      ? areas.filter((a) => shortlist.includes(a.id))
      : areas.slice(0, 5);
    setText('ts-count', shortlist.length ? `${shortlist.length} ${shortlist.length === 1 ? 'area' : 'areas'}` : `${items.length} suggested`);
    const ul = $('home-areas');
    if (!ul) return;
    if (!items.length) {
      ul.innerHTML = '<li class="empty-note">No areas yet — open the Areas tab to browse.</li>';
      return;
    }
    ul.innerHTML = items.slice(0, 5).map((a, i) => {
      const price = priceFor(a);
      let dotClass = 'fit-dot fit-dot--unknown';
      let dotTitle = 'No price data for this area';
      if (price && financesData && criteria) {
        const r = assessAffordability({ price, finances: financesData, criteria });
        dotClass = fitDotClass(r.verdict);
        dotTitle = `${r.verdict} at ${esc(gbp(price))}`;
      }
      return `
        <li>
          <span class="sl-index num">${String(i + 1).padStart(2, '0')}</span>
          <span class="${dotClass}" title="${dotTitle}" aria-label="${dotTitle}"></span>
          <span class="sl-name">
            <a href="pages/area-detail.html?id=${encodeURIComponent(a.id)}">${esc(a.name)}</a>
            <small class="sl-place">${esc(a.town || a.subRegion || a.county || '')}</small>
          </span>
          <span class="sl-meta">${esc(a.county || '')}</span>
        </li>
      `;
    }).join('');
  } catch (e) { console.error('shortlist tile error', e); }
}
