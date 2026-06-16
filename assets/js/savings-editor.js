// savings-editor.js — shared "Edit savings" dialog, mounted on both the Finances
// and Profile pages. Lets the user set their cash savings (finances.savings.current)
// and, if they hold one, their Trading 212 ISA value — the two raw inputs behind the
// derived deposit total shown everywhere (dashboard deposit tile, Finances "Total
// savings", Profile "Saved to date"). On save it persists via the storage layer; the
// host page re-renders through the onSaved callback.
//
// The dialog markup is created in JS and appended to <body>, so a page only needs to
// add a trigger button. Styling reuses the global <dialog> + .dialog-head/.dialog-foot
// + .edit-field-label rules (components/dialog.css, components/field.css).
import { getFinances, saveFinances, getInvestments, saveInvestments } from './storage.js';
import { applyCashSavings, applyIsaValue, previewDepositTotal, hasIsa } from './savings-edit.js';
import { gbp } from './format.js';
import { byId } from './dom.js';

let dlg = null;
let rawFinances = null;
let investments = null;
let onSavedCb = null;

function q(sel) { return dlg.querySelector(sel); }

function setStatus(msg, kind = '') {
  const el = q('[data-se-status]');
  if (!el) return;
  el.textContent = msg || '';
  el.dataset.kind = kind;
}

// Read the in-progress input values and apply them onto the loaded records.
function currentEdits() {
  const fin = applyCashSavings(rawFinances, byId('se-cash').value);
  const inv = hasIsa(investments) ? applyIsaValue(investments, byId('se-isa').value) : investments;
  return { fin, inv };
}

function updatePreview() {
  const { fin, inv } = currentEdits();
  const totalEl = q('[data-se-total]');
  if (totalEl) totalEl.textContent = gbp(previewDepositTotal(fin, inv));
}

function buildDialog() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.id = 'savings-edit-dialog';
  dlg.setAttribute('aria-labelledby', 'savings-edit-title');
  dlg.innerHTML = `
    <article>
      <header class="dialog-head">
        <h2 id="savings-edit-title">Edit savings</h2>
        <button type="button" class="outline secondary" data-se-close aria-label="Close">Cancel</button>
      </header>
      <form method="dialog">
        <label class="edit-field-label" for="se-cash">Cash savings (held outside investments)</label>
        <input type="number" id="se-cash" name="cash" inputmode="decimal" min="0" step="any" autocomplete="off" />
        <div data-se-isa-wrap hidden>
          <label class="edit-field-label" for="se-isa">Investments &mdash; Trading&nbsp;212 ISA value</label>
          <input type="number" id="se-isa" name="isa" inputmode="decimal" min="0" step="any" autocomplete="off" />
          <p class="muted small" data-se-earmark></p>
        </div>
        <p class="mt-4">Deposit total: <strong data-se-total>&mdash;</strong></p>
        <p class="status-line" data-se-status aria-live="polite"></p>
      </form>
      <footer class="dialog-foot">
        <button type="button" class="outline secondary" data-se-close>Cancel</button>
        <button type="button" data-se-save>Save</button>
      </footer>
    </article>`;
  document.body.appendChild(dlg);
  dlg.querySelectorAll('[data-se-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  q('[data-se-save]').addEventListener('click', onSave);
  byId('se-cash').addEventListener('input', updatePreview);
  byId('se-isa').addEventListener('input', updatePreview);
  return dlg;
}

async function openEditor() {
  buildDialog();
  setStatus('');
  try {
    rawFinances = (await getFinances()) || {};
    investments = await getInvestments();
  } catch (e) {
    console.error('savings-editor load', e);
    rawFinances = rawFinances || {};
  }
  const cashEl = byId('se-cash');
  cashEl.value = String(Number(rawFinances?.savings?.current ?? 0));
  const isaWrap = q('[data-se-isa-wrap]');
  if (hasIsa(investments)) {
    isaWrap.hidden = false;
    byId('se-isa').value = String(Number(investments.trading212ISA.currentPortfolioValue ?? 0));
    const pct = Number(investments.trading212ISA.earmarkPct ?? 0);
    q('[data-se-earmark]').textContent = pct > 0 && pct < 100
      ? `${pct}% of this is earmarked toward your deposit.`
      : 'Counts in full toward your deposit.';
  } else {
    isaWrap.hidden = true;
  }
  updatePreview();
  dlg.showModal();
  cashEl.focus();
}

async function onSave() {
  const { fin, inv } = currentEdits();
  setStatus('Saving…');
  try {
    await saveFinances(fin);
    if (hasIsa(investments) && inv) await saveInvestments(inv);
    rawFinances = fin;
    investments = inv;
    dlg.close();
    if (typeof onSavedCb === 'function') onSavedCb();
  } catch (e) {
    console.error('savings-editor save', e);
    setStatus('Could not save — please try again.', 'err');
  }
}

/**
 * Wire a trigger button to the shared savings dialog.
 * @param {object} opts
 * @param {string} opts.openerId  id of the button that opens the editor.
 * @param {function} [opts.onSaved] called after a successful save so the page re-renders.
 * @returns {{ open: function }}
 */
export function mountSavingsEditor({ openerId, onSaved } = {}) {
  onSavedCb = onSaved || null;
  const opener = openerId ? byId(openerId) : null;
  if (opener) opener.addEventListener('click', openEditor);
  return { open: openEditor };
}
