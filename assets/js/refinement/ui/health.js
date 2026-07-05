// refinement/ui/health.js — renders the engine-health strip (view-model from
// ../health.js). Fresh = one quiet line; stale/never = a prominent strip naming the
// exact owner action, plus the deep-link to the Actions run screen the page already
// uses elsewhere. Plain DOM — no Chart.js dependency, no storage access.
import { esc } from '../../dom.js';

const ACTIONS_URL = 'https://github.com/seanparkerai/rec/actions/workflows/refinement-run.yml';

/**
 * @param {HTMLElement|null} el
 * @param {{ state: string, headline: string, detail: string, ownerAction: string }} health
 */
export function renderEngineHealth(el, health) {
  if (!el) return;
  el.hidden = false;
  el.classList.remove('ref-health--fresh', 'ref-health--stale', 'ref-health--never');
  el.classList.add(`ref-health--${health.state}`);
  const icon = health.state === 'fresh' ? '✓' : '⚠';
  const detail = health.detail ? `<p class="ref-health__detail">${esc(health.detail)}</p>` : '';
  const action = health.ownerAction
    ? `<details class="ref-health__fix">
         <summary>How to fix it (one-time, ~2 minutes)</summary>
         <p>${esc(health.ownerAction)}</p>
         <a class="ref-health__link" href="${ACTIONS_URL}" target="_blank" rel="noopener noreferrer">Open the workflow <span aria-hidden="true">↗</span></a>
       </details>`
    : '';
  el.innerHTML = `
    <p class="ref-health__headline"><span class="ref-health__icon" aria-hidden="true">${icon}</span> ${esc(health.headline)}</p>
    ${detail}
    ${action}`;
}
