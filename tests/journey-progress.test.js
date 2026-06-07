// journey-progress.test.js — unit tests for the pure timeline progress helpers
// (assets/js/journey/progress.js). No DOM, no storage — fixture in, counts out.
import {
  isTaskDone, stepProgress, stepIsDone, phaseProgress, phaseIsDone,
  overall, orderedSteps, currentStep,
} from '../assets/js/journey/progress.js';

// Small two-phase fixture: phase A (2 steps: a1[2 tasks], a2[1 task]),
// phase B (1 step: b1[2 tasks]).
const J = {
  version: 1,
  phases: [
    { id: 'a', title: 'A', summary: 's', steps: [
      { id: 'a1', title: 'A1', tasks: [{ id: 'a.a1.1', label: 'x' }, { id: 'a.a1.2', label: 'y' }] },
      { id: 'a2', title: 'A2', tasks: [{ id: 'a.a2.1', label: 'z' }] },
    ] },
    { id: 'b', title: 'B', summary: 's', steps: [
      { id: 'b1', title: 'B1', tasks: [{ id: 'b.b1.1', label: 'p' }, { id: 'b.b1.2', label: 'q' }] },
    ] },
  ],
};
const ticks = (...ids) => ({ tasks: Object.fromEntries(ids.map((id) => [id, true])) });

export async function register({ test, assert, assertEqual }) {
  const stepA1 = J.phases[0].steps[0];
  const stepA2 = J.phases[0].steps[1];
  const phaseA = J.phases[0];

  test('journey/progress: isTaskDone reads the tasks map', () => {
    assert(isTaskDone(ticks('a.a1.1'), 'a.a1.1') === true);
    assert(isTaskDone(ticks('a.a1.1'), 'a.a1.2') === false);
    assert(isTaskDone({ tasks: {} }, 'a.a1.1') === false);
    assert(isTaskDone({}, 'a.a1.1') === false);
  });

  test('journey/progress: stepProgress counts ticked/total tasks', () => {
    assertEqual(JSON.stringify(stepProgress({ tasks: {} }, stepA1)), JSON.stringify({ done: 0, total: 2 }));
    assertEqual(JSON.stringify(stepProgress(ticks('a.a1.1'), stepA1)), JSON.stringify({ done: 1, total: 2 }));
    assertEqual(JSON.stringify(stepProgress(ticks('a.a1.1', 'a.a1.2'), stepA1)), JSON.stringify({ done: 2, total: 2 }));
  });

  test('journey/progress: stepIsDone only when all tasks ticked', () => {
    assert(stepIsDone(ticks('a.a1.1'), stepA1) === false);
    assert(stepIsDone(ticks('a.a1.1', 'a.a1.2'), stepA1) === true);
    assert(stepIsDone(ticks('a.a2.1'), stepA2) === true); // single-task step
  });

  test('journey/progress: phaseProgress counts done STEPS (not tasks)', () => {
    // a2 done (1 step), a1 not → 1/2 steps.
    assertEqual(JSON.stringify(phaseProgress(ticks('a.a2.1'), phaseA)), JSON.stringify({ done: 1, total: 2 }));
    assertEqual(JSON.stringify(phaseProgress(ticks('a.a1.1', 'a.a1.2', 'a.a2.1'), phaseA)), JSON.stringify({ done: 2, total: 2 }));
  });

  test('journey/progress: phaseIsDone only when all steps done', () => {
    assert(phaseIsDone(ticks('a.a2.1'), phaseA) === false);
    assert(phaseIsDone(ticks('a.a1.1', 'a.a1.2', 'a.a2.1'), phaseA) === true);
  });

  test('journey/progress: overall counts ticked/total TASKS across the journey', () => {
    assertEqual(JSON.stringify(overall(J, { tasks: {} })), JSON.stringify({ done: 0, total: 5 }));
    assertEqual(JSON.stringify(overall(J, ticks('a.a1.1', 'b.b1.2'))), JSON.stringify({ done: 2, total: 5 }));
  });

  test('journey/progress: orderedSteps is document order, paired with phase', () => {
    const ids = orderedSteps(J).map((p) => `${p.phase.id}.${p.step.id}`);
    assertEqual(ids.join(','), 'a.a1,a.a2,b.b1');
  });

  test('journey/progress: currentStep is the first not-done step', () => {
    assertEqual(currentStep(J, { tasks: {} }).step.id, 'a1');
    // a1 done → current is a2
    assertEqual(currentStep(J, ticks('a.a1.1', 'a.a1.2')).step.id, 'a2');
    // a1 + a2 done → current jumps to b1 (skips the done step)
    assertEqual(currentStep(J, ticks('a.a1.1', 'a.a1.2', 'a.a2.1')).step.id, 'b1');
  });

  test('journey/progress: currentStep is null when everything is done', () => {
    const all = ticks('a.a1.1', 'a.a1.2', 'a.a2.1', 'b.b1.1', 'b.b1.2');
    assertEqual(currentStep(J, all), null);
  });
}
