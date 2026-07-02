// areas/filter-sheet-init.js — the areas directory's filter sheet, folded onto
// the shared wireFilterSheet mechanism (3.7a). This page's inline script was
// the ORIGINAL the module was extracted from at 3.4c; the module now serves all
// three surfaces, so the inline copy dies here. Areas-specific parts kept:
// the describe() reading this page's county/sub-region/fit controls, the live
// result-count mirror into the sheet footer, and the refresh triggers (input/
// change in the sheet, the areas list re-rendering, shell:ready). The old
// inline pills were innerHTML — raw search text could become markup; the shared
// module renders pills as TEXT, closing that hole.
import { wireFilterSheet } from '../filter-sheet.js';
import { byId } from '../dom.js';

function describe() {
  const pills = [];
  const q = byId('search')?.value?.trim();
  const county = byId('filter-county')?.value;
  const sub = byId('filter-subregion')?.value;
  if (q) pills.push(`“${q}”`);
  if (county && county !== 'all') pills.push(county);
  if (sub && sub !== 'all') pills.push(sub);
  if (byId('only-shortlisted')?.checked) pills.push('★ shortlisted');
  if (byId('show-paused')?.checked) pills.push('incl. paused');
  return pills;
}

export function initAreaFilterSheet(doc = document) {
  const dlg = doc.getElementById('filter-sheet');
  if (!dlg) return null;
  const sheet = wireFilterSheet({
    dlg,
    openBtn: doc.getElementById('open-filters'),
    closeBtn: doc.getElementById('filter-sheet-close'),
    activeEl: doc.getElementById('active-filters'),
    describe,
  });
  const refresh = () => {
    sheet?.refresh();
    // Mirror the live "N areas match" total into the sheet footer.
    const sheetCount = doc.getElementById('filter-sheet-count');
    const resultCount = doc.getElementById('result-count');
    if (sheetCount && resultCount) sheetCount.textContent = resultCount.textContent || '0';
  };
  doc.addEventListener('input', (e) => {
    if (e.target?.closest?.('#filter-sheet') || e.target?.id === 'search') refresh();
  });
  doc.addEventListener('change', (e) => {
    if (e.target?.closest?.('#filter-sheet')) refresh();
  });
  // Also refresh after the page script renders results (areas list changes).
  const grid = doc.getElementById('areas-grid');
  if (grid) new MutationObserver(refresh).observe(grid, { childList: true });
  doc.addEventListener('shell:ready', refresh);
  refresh();
  return sheet;
}

if (typeof document !== 'undefined') initAreaFilterSheet();
