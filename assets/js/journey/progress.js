// journey/progress.js — pure progress helpers for the buying-journey timeline.
// No DOM, no storage — takes the journey content (data/journey.json shape) and the
// tick state ({ tasks: { taskId: true } }) and derives done/total counts and the
// "current" step. Importable by both page-journey.js and the Node test harness.
//
// Mirrors the spirit of the old page-journey.js nextItem()/progress() helpers: a step
// is done when all its tasks are ticked; a phase is done when all its steps are; the
// current step is the first not-done step in document order.

/** Is a single task ticked? */
export function isTaskDone(state, id) {
  return !!(state && state.tasks && state.tasks[id]);
}

/** Ticked/total tasks for one step. */
export function stepProgress(state, step) {
  const tasks = step?.tasks || [];
  const done = tasks.reduce((n, t) => n + (isTaskDone(state, t.id) ? 1 : 0), 0);
  return { done, total: tasks.length };
}

/** A step is done when it has tasks and all of them are ticked. */
export function stepIsDone(state, step) {
  const { done, total } = stepProgress(state, step);
  return total > 0 && done === total;
}

/** Done/total *steps* for one phase (phase node shows steps, not tasks). */
export function phaseProgress(state, phase) {
  const steps = phase?.steps || [];
  const done = steps.reduce((n, s) => n + (stepIsDone(state, s) ? 1 : 0), 0);
  return { done, total: steps.length };
}

/** A phase is done when it has steps and all of them are done. */
export function phaseIsDone(state, phase) {
  const { done, total } = phaseProgress(state, phase);
  return total > 0 && done === total;
}

/** Overall ticked/total *tasks* across the whole journey. */
export function overall(journey, state) {
  let done = 0;
  let total = 0;
  for (const p of journey?.phases || []) {
    for (const s of p.steps || []) {
      for (const t of s.tasks || []) {
        total++;
        if (isTaskDone(state, t.id)) done++;
      }
    }
  }
  return { done, total };
}

/** Flat, document-ordered list of every step, paired with its phase. */
export function orderedSteps(journey) {
  const out = [];
  for (const phase of journey?.phases || []) {
    for (const step of phase.steps || []) out.push({ phase, step });
  }
  return out;
}

/** The first not-done step in document order, or null when everything is done. */
export function currentStep(journey, state) {
  for (const pair of orderedSteps(journey)) {
    if (!stepIsDone(state, pair.step)) return pair;
  }
  return null;
}
