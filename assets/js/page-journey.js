// page-journey.js — the buying-journey timeline. One long vertical rail of phases;
// each step row is tappable and opens a <dialog> with a sub-checklist you tick off.
// Tick state ({ tasks: { taskId: true } }) persists per household in Supabase
// (journey_progress) with a localStorage write-through cache + background revalidation.
import { loadJSON } from './data-loader.js';
import { getJourneyProgress, saveJourneyProgress } from './storage.js';
import { url } from './config.js';
import { esc, byId as $ } from './dom.js';
import {
  stepProgress, stepIsDone, phaseProgress, phaseIsDone,
  overall, currentStep,
} from './journey/progress.js';

let journey = null;
let state = { tasks: {} };
let openPair = null;       // { phase, step } currently in the modal
let lastTrigger = null;    // step row that opened the modal (for focus return)

// ── Helpers ───────────────────────────────────────────────────────────────
function outreachLink(task) {
  if (!task.outreachTemplateId) return '';
  const id = esc(task.outreachTemplateId);
  return `<a href="ask.html?composeTemplate=${id}" data-nav="pages/ask.html?composeTemplate=${id}" class="journey-outreach-link" aria-label="Draft an email for this step">&rarr; Email</a>`;
}

function announce(msg) {
  const el = $('tl-status-live');
  if (el) el.textContent = msg;
}

// ── Render: timeline ────────────────────────────────────────────────────────
function stepState(step, current) {
  if (stepIsDone(state, step)) return 'done';
  if (current && current.step === step) return 'current';
  return 'upcoming';
}

function phaseState(phase, current) {
  if (phaseIsDone(state, phase)) return 'done';
  if (current && current.phase === phase) return 'current';
  return 'upcoming';
}

function renderTimeline() {
  const current = currentStep(journey, state);

  const html = journey.phases.map((phase, pi) => {
    const pp = phaseProgress(state, phase);
    const pState = phaseState(phase, current);
    const steps = phase.steps.map((step) => {
      const sp = stepProgress(state, step);
      const sState = stepState(step, current);
      return `
        <li class="tl-step-row">
          <button type="button" class="tl-step tl-step--${sState}"
                  data-phase="${esc(phase.id)}" data-step="${esc(step.id)}"
                  aria-haspopup="dialog">
            <span class="tl-step-dot" aria-hidden="true"></span>
            <span class="tl-step-title">${esc(step.title)}</span>
            <span class="tl-step-count">${sState === 'done' ? 'done' : `${sp.done}/${sp.total}`}</span>
          </button>
        </li>`;
    }).join('');

    return `
      <li class="tl-phase tl-phase--${pState}">
        <div class="tl-phase-head">
          <span class="tl-node" aria-hidden="true"></span>
          <div class="tl-phase-meta">
            <p class="tl-eyebrow">Phase ${pi + 1} · ${pp.done}/${pp.total} steps</p>
            <h2 class="tl-phase-title">${esc(phase.title)}</h2>
            <p class="tl-phase-summary">${esc(phase.summary)}</p>
          </div>
        </div>
        <ul class="tl-steps">${steps}</ul>
      </li>`;
  }).join('');

  $('timeline').innerHTML = html;

  // Wire each step row to open its modal.
  document.querySelectorAll('.tl-step').forEach((btn) => {
    btn.addEventListener('click', () => openStep(btn.dataset.phase, btn.dataset.step, btn));
  });

  renderHeadProgress(current);
}

function renderHeadProgress(current = currentStep(journey, state)) {
  const o = overall(journey, state);
  const overallEl = $('tl-overall');
  if (overallEl) overallEl.textContent = `${o.done} / ${o.total} done`;
  const currentEl = $('tl-current');
  if (currentEl) {
    currentEl.textContent = current
      ? `Where you are: ${current.step.title}`
      : 'Every step ticked off — congratulations.';
  }
}

// ── Modal ───────────────────────────────────────────────────────────────────
function lookup(phaseId, stepId) {
  const phase = journey.phases.find((p) => p.id === phaseId);
  const step = phase?.steps.find((s) => s.id === stepId) || null;
  return phase && step ? { phase, step } : null;
}

function renderModalBody() {
  if (!openPair) return;
  const { step } = openPair;
  const sp = stepProgress(state, step);

  $('step-modal-title').textContent = step.title;
  const blurbEl = $('step-modal-blurb');
  blurbEl.textContent = step.blurb || '';
  blurbEl.hidden = !step.blurb;

  const linkEl = $('step-modal-link');
  if (step.link) {
    linkEl.hidden = false;
    linkEl.innerHTML = `<a href="${esc(url(step.link))}" class="tl-step-link">Open the related page &rarr;</a>`;
  } else {
    linkEl.hidden = true;
    linkEl.innerHTML = '';
  }

  $('step-modal-tasks').innerHTML = step.tasks.map((task) => {
    const checked = !!state.tasks[task.id];
    const note = task.note ? `<p class="check-meta"><span class="muted">${esc(task.note)}</span></p>` : '';
    return `
      <li class="check-row-item${checked ? ' is-done' : ''}">
        <label class="check-row">
          <input type="checkbox" data-task-id="${esc(task.id)}" ${checked ? 'checked' : ''} />
          <span class="check-label">
            <span class="check-title">${esc(task.label)}</span>
            ${note}
          </span>
          ${outreachLink(task)}
        </label>
      </li>`;
  }).join('');

  $('step-modal-progress').textContent = `${sp.done} of ${sp.total} done`;
}

function openStep(phaseId, stepId, trigger) {
  const pair = lookup(phaseId, stepId);
  if (!pair) return;
  openPair = pair;
  lastTrigger = trigger || null;
  renderModalBody();
  const dialog = $('step-modal');
  if (!dialog.open) dialog.showModal();
}

function closeStep() {
  const dialog = $('step-modal');
  if (dialog.open) dialog.close();
}

function onTaskToggle(e) {
  const box = e.target.closest('input[type="checkbox"][data-task-id]');
  if (!box) return;
  const id = box.dataset.taskId;
  if (box.checked) state.tasks[id] = true;
  else delete state.tasks[id];
  saveJourneyProgress(state); // optimistic, fire-and-forget (toast on Supabase error)
  // Update in place so the toggled checkbox keeps keyboard focus (no modal re-render).
  box.closest('.check-row-item')?.classList.toggle('is-done', box.checked);
  if (openPair) {
    const sp = stepProgress(state, openPair.step);
    $('step-modal-progress').textContent = `${sp.done} of ${sp.total} done`;
  }
  renderTimeline(); // refresh the underlying rail (counts + node states)
  const o = overall(journey, state);
  announce(`${o.done} of ${o.total} tasks done`);
}

// ── Reset (native confirm dialog) ────────────────────────────────────────────
function attachActions() {
  const dialog = $('step-modal');

  // Task ticks (delegated so re-rendered checkboxes stay wired).
  $('step-modal-tasks').addEventListener('change', onTaskToggle);

  // Close: button, backdrop click, Esc (Esc handled natively by <dialog>).
  $('step-modal-close').addEventListener('click', closeStep);
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return; // inner content has its own target
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) closeStep();
  });
  // Return focus to the step row that opened the modal (SC 2.4.11).
  dialog.addEventListener('close', () => { openPair = null; lastTrigger?.focus(); });

  // Clear-all uses a confirmation <dialog>, never window.confirm.
  $('btn-reset-all').addEventListener('click', () => $('reset-modal').showModal());
  $('reset-cancel').addEventListener('click', () => $('reset-modal').close());
  $('reset-confirm').addEventListener('click', () => {
    state = { tasks: {} };
    saveJourneyProgress(state);
    $('reset-modal').close();
    renderTimeline();
    announce('All ticks cleared.');
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  try {
    journey = await loadJSON('journey');
    // Re-render when a fresher row arrives from Supabase (cross-device sync).
    state = await getJourneyProgress({
      onUpdate: (fresh) => {
        state = fresh && typeof fresh === 'object' && fresh.tasks ? fresh : { tasks: {} };
        renderTimeline();
        if (openPair) renderModalBody();
      },
    }) || { tasks: {} };
    if (!state.tasks || typeof state.tasks !== 'object') state = { tasks: {} };
    renderTimeline();
    attachActions();
  } catch (e) {
    console.error('journey init error', e);
    const tl = $('timeline');
    if (tl) tl.innerHTML = '<p class="muted">Failed to load the buying journey.</p>';
  }
}

init();
