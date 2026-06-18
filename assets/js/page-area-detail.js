// page-area-detail.js — renders a single area by ?id=, using the 9-category framework.
import { getAreaCatalog, getAreaDetail, getHouseholdAreas, setHouseholdAreaStatus, removeHouseholdArea, getShortlist, saveShortlist, getFinances, getCriteria } from './storage.js';
import { url } from './config.js';
import { gbp } from './format.js';
import { assessAffordability } from './affordability.js';
import { esc, byId as $ } from './dom.js';
import {
  listOrPlaceholder, textOrPlaceholder, renderOverview, renderAmenities, ofstedClass, renderSchools,
  commuteBandClass, renderTransport, renderPrices, renderProsCons, renderImages, renderSources,
  renderEssentials, matchedPrice, renderVerdictStrip,
} from './page-area-detail/sections.js';

function attachFootAfford(a, finances, criteria) {
  const wrap = document.getElementById('area-foot-afford');
  if (!wrap || !finances || !criteria) return;
  wrap.hidden = false;
  const slider = document.getElementById('area-afford-slider');
  const number = document.getElementById('area-afford-number');
  const display = document.getElementById('area-afford-display');
  const pill = document.getElementById('area-afford-pill');
  const initial = matchedPrice(a, criteria).price ?? Number(criteria?.budget?.max || 0);
  slider.value = String(initial);
  number.value = String(initial);
  if (display) display.textContent = gbp(initial);

  const update = (raw) => {
    const price = Math.max(100000, Math.min(2000000, Number(raw) || 0));
    if (display) display.textContent = gbp(price);
    if (slider.value !== String(price)) slider.value = String(price);
    if (number.value !== String(price)) number.value = String(price);
    const r = assessAffordability({ price, finances, criteria });
    if (pill) {
      pill.className = `afford-verdict-pill afford-verdict-pill--${r.verdict}`;
      pill.textContent = r.verdict;
    }
    document.getElementById('area-afford-loan').textContent = gbp(r.loanRequired);
    document.getElementById('area-afford-ltv').innerHTML = `${r.ltvPct.toFixed(1)}%`;
    document.getElementById('area-afford-monthly').textContent = gbp(r.monthlyPI);
    document.getElementById('area-afford-spare').textContent = gbp(r.monthlySpareAfter);
    document.getElementById('area-afford-why').innerHTML = r.whyVerdict.map((s) => `<li>${esc(s)}</li>`).join('');
  };
  slider.addEventListener('input', (e) => update(e.target.value));
  number.addEventListener('input', (e) => update(e.target.value));
  update(initial);
}

async function renderArea(a) {
  document.title = `${a.name} · GR`;

  // Header
  $('area-title').textContent = a.name;
  // Pair with the named transition set in page-areas.js so the title morphs in.
  $('area-title').style.viewTransitionName = 'area-title';
  $('area-village').textContent = a.village && a.village !== a.name ? a.village : '';
  $('area-meta').innerHTML = `
    <span>${esc(a.town)}</span><span aria-hidden="true">·</span>
    <span>${esc(a.county)}</span><span aria-hidden="true">·</span>
    <span>${esc(a.postcode)}</span>
    ${a.subRegion ? `<span aria-hidden="true">·</span><span>${esc(a.subRegion)}</span>` : ''}
  `;

  // Tiles
  $('tile-status').textContent = a.status || 'directory';
  $('tile-subregion').textContent = a.subRegion || '—';
  $('tile-postcode').textContent = a.postcode || '—';
  $('tile-county').textContent = a.county || '—';

  // Sections
  renderEssentials(a);
  $('sec-overview').innerHTML = renderOverview(a);
  $('sec-amenities').innerHTML = renderAmenities(a);
  $('sec-schools').innerHTML = renderSchools(a);
  $('sec-transport').innerHTML = renderTransport(a);
  $('sec-prices').innerHTML = renderPrices(a);
  $('sec-things').innerHTML = listOrPlaceholder(a.thingsToDo);
  $('sec-eat').innerHTML = listOrPlaceholder(
    a.placesToEat,
    (x) => typeof x === 'string' ? esc(x) : [
      x.url ? `<a href="${esc(x.url)}" rel="noopener" target="_blank">${esc(x.name || x.url)}</a>` : `<strong>${esc(x.name || '')}</strong>`,
      x.type ? ` <span class="muted">· ${esc(x.type)}</span>` : '',
      x.notes ? ` — ${esc(x.notes)}` : '',
    ].join(''),
  );
  $('sec-proscons').innerHTML = renderProsCons(a);
  const suits = Array.isArray(a.whoItSuits) ? a.whoItSuits : (a.whoItSuits ? [a.whoItSuits] : null);
  $('sec-suits').innerHTML = listOrPlaceholder(suits);

  // Images + sources appended (if any)
  $('extras').innerHTML = renderImages(a) + renderSources(a);

  // Shortlist button
  const shortlist = new Set(await getShortlist());
  const starred = shortlist.has(a.id);
  const btn = $('btn-star');
  btn.textContent = starred ? '★ Shortlisted' : '☆ Add to shortlist';
  btn.setAttribute('aria-pressed', starred);
  btn.classList.toggle('is-starred', starred);
  btn.addEventListener('click', async () => {
    const s = new Set(await getShortlist());
    if (s.has(a.id)) s.delete(a.id); else s.add(a.id);
    saveShortlist([...s]);
    const now = s.has(a.id);
    btn.textContent = now ? '★ Shortlisted' : '☆ Add to shortlist';
    btn.setAttribute('aria-pressed', now);
    btn.classList.toggle('is-starred', now);
  });
}

function renderNotFound(id) {
  document.title = 'Area not found · GR';
  $('area-title').textContent = 'Area not found';
  $('area-meta').textContent = '';
  const main = document.querySelector('main');
  main.innerHTML = `
    <div class="page-head">
      <h1>Area not found</h1>
      <p class="muted">No area in the directory matches <code>${esc(id)}</code>.</p>
    </div>
    <p><a href="${url('pages/areas.html')}">← Back to areas directory</a></p>
  `;
}

// Per-household area controls: an Active/Paused toggle (reversible) + a hard
// Remove. Shown ONLY for an area the current household actually has linked — the
// link record carries _status (the offline/pre-auth catalog fallback does not),
// so that is the membership signal. Pausing flips household_areas.status to
// 'inactive' (hidden from listings + excluded from fetch demand, still listed for
// reactivation); Remove hard-deletes the link behind a <dialog> confirm.
function attachAreaMembership(a, household) {
  const statusBtn = $('btn-area-status');
  const removeBtn = $('btn-area-remove');
  const member = (household || []).find((x) => x.id === a.id);
  if (!member || !member._status) {
    if (statusBtn) statusBtn.hidden = true;
    if (removeBtn) removeBtn.hidden = true;
    return;
  }
  let status = member._status === 'inactive' ? 'inactive' : 'active';
  const paintStatus = () => {
    const paused = status === 'inactive';
    statusBtn.hidden = false;
    statusBtn.setAttribute('aria-pressed', String(paused));
    statusBtn.classList.toggle('is-paused', paused);
    statusBtn.textContent = paused ? 'Paused — reactivate' : 'Active — pause';
  };
  paintStatus();
  statusBtn.addEventListener('click', async () => {
    const next = status === 'inactive' ? 'active' : 'inactive';
    statusBtn.disabled = true;
    const ok = await setHouseholdAreaStatus(a.id, next);
    statusBtn.disabled = false;
    if (ok) { status = next; paintStatus(); }
  });

  removeBtn.hidden = false;
  const dlg = $('confirm-remove');
  removeBtn.addEventListener('click', () => dlg?.showModal());
  $('confirm-remove-no')?.addEventListener('click', () => dlg?.close());
  $('confirm-remove-yes')?.addEventListener('click', async () => {
    const yes = $('confirm-remove-yes');
    yes.disabled = true;
    const ok = await removeHouseholdArea(a.id);
    yes.disabled = false;
    dlg?.close();
    if (ok) location.href = url('pages/areas.html');
  });
}

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) { renderNotFound('(no id)'); return; }

  try {
    // The household's own selection (incl. paused) — fetched once, reused for both
    // stub resolution and the membership controls. includeInactive so a PAUSED stub
    // still resolves here (it lives only in the Supabase areas row) rather than 404ing.
    let household = [];
    try { household = (await getHouseholdAreas({ includeInactive: true })) || []; } catch (_) { /* pre-auth/offline */ }

    let a = null;
    // 1. Curated repo detail file (data/areas/<id>.json) — the common case.
    try { a = await getAreaDetail(id); } catch (_) { /* fall through */ }
    // 2. Repo catalog index — curated areas without a full detail file.
    if (!a) {
      const areas = await getAreaCatalog();
      a = areas.find((x) => x.id === id) || null;
    }
    // 3. The household's own selection — a member-added stub lives ONLY in the
    //    Supabase areas row (via household_areas), never in the repo, so it must be
    //    resolved here or the page wrongly 404s. Renders with "research pending"
    //    placeholders for the unwritten sections.
    if (!a) a = household.find((x) => x.id === id) || null;
    if (!a) { renderNotFound(id); return; }
    await renderArea(a);
    attachAreaMembership(a, household);

    // Phase 4b: verdict strip + foot mini-afford widget — best-effort if
    // finances/criteria load successfully.
    let finances = null, criteria = null;
    try { finances = await getFinances(); } catch (e) { console.error('finances load', e); }
    try { criteria = await getCriteria(); } catch (e) { console.error('criteria load', e); }
    renderVerdictStrip(a, finances, criteria);
    attachFootAfford(a, finances, criteria);
  } catch (e) {
    console.error('area detail error', e);
    renderNotFound(id);
  }
}

init();
