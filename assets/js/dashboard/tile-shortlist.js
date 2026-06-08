import { assessAffordability } from '../affordability.js';
import { gbp } from '../format.js';
import { getShortlist, getHouseholdAreas } from '../storage.js';
import { resolveAreaRef, isPendingArea } from '../areas/area-ref.js';
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

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function renderShortlist(financesData, criteria) {
  try {
    const shortlist = await getShortlist();
    const areas = await getHouseholdAreas();
    // Drive the list off the household's OWN selection (household_areas). Stubs the
    // user added in onboarding are included here — they must be visible, not hidden
    // by an active:true filter.
    const items = shortlist.length
      ? areas.filter((a) => shortlist.includes(a.id))
      : areas.slice(0, 5);

    // Honest count: stubs count toward "areas you're tracking" but are surfaced
    // separately as "researching" so a pending area never implies live listings.
    const pendingShown = items.filter(isPendingArea).length;
    let count = shortlist.length ? plural(shortlist.length, 'area', 'areas') : `${items.length} suggested`;
    if (pendingShown) count += ` · ${pendingShown} researching`;
    setText('ts-count', count);

    const ul = $('home-areas');
    if (!ul) return;
    if (!items.length) {
      ul.innerHTML = '<li class="empty-note">No areas yet — open the Areas tab to browse.</li>';
      return;
    }

    const shown = items.slice(0, 5);
    // If the household has areas but none are live yet, say so explicitly instead of
    // letting the empty "No areas yet" copy (above) ever fire for a real selection.
    const liveShown = shown.length - shown.filter(isPendingArea).length;
    const lead = liveShown ? '' :
      `<li class="sl-note">${plural(shown.filter(isPendingArea).length, 'area', 'areas')} researching — listings coming soon.</li>`;

    ul.innerHTML = lead + shown.map((a, i) => {
      const ref = resolveAreaRef(a);
      const price = priceFor(a);
      let dotClass = 'fit-dot fit-dot--unknown';
      let dotTitle = 'No price data for this area';
      if (price && financesData && criteria) {
        const r = assessAffordability({ price, finances: financesData, criteria });
        dotClass = fitDotClass(r.verdict);
        dotTitle = `${r.verdict} at ${esc(gbp(price))}`;
      }
      const statusClass = ref.isPending ? 'sl-status sl-status--pending' : 'sl-status sl-status--live';
      const statusLabel = ref.isPending ? 'Researching' : 'Live';
      const statusTitle = ref.isPending
        ? 'Area you added — researching, listings coming soon'
        : 'Live area with listings';
      return `
        <li>
          <span class="sl-index num">${String(i + 1).padStart(2, '0')}</span>
          <span class="${dotClass}" title="${dotTitle}" aria-label="${dotTitle}"></span>
          <span class="sl-name">
            <a href="pages/area-detail.html?id=${encodeURIComponent(ref.id)}">${esc(ref.name)}</a>
            <small class="sl-place">${esc(ref.town || '')}</small>
          </span>
          <span class="${statusClass}" title="${statusTitle}">${statusLabel}</span>
        </li>
      `;
    }).join('');
  } catch (e) { console.error('shortlist tile error', e); }
}
