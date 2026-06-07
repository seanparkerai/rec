// dashboard/tile-journey.js — the Home "Where you are" tile. Reads the buying-journey
// timeline (data/journey.json) + the per-household tick state (journey_progress, via
// storage.getJourneyProgress). One track node per phase (done / current / upcoming);
// the next action is the current step, and the tick button advances one task within it.
import { loadJSON } from '../data-loader.js';
import { getJourneyProgress, saveJourneyProgress } from '../storage.js';
import { byId as $, setText } from '../dom.js';
import { phaseProgress, phaseIsDone, currentStep } from '../journey/progress.js';

export async function renderJourneyTrack() {
  try {
    const journey = await loadJSON('journey');
    const state = await getJourneyProgress() || { tasks: {} };
    const current = currentStep(journey, state);
    const currentPhaseId = current?.phase.id || null;

    $('tj-track').innerHTML = journey.phases.map((phase, i) => {
      const pp = phaseProgress(state, phase);
      const mod = phaseIsDone(state, phase) ? '--done'
                : (phase.id === currentPhaseId ? '--current' : '');
      return `
        <li class="journey-track__node ${mod ? 'journey-track__node' + mod : ''}">
          <span class="journey-track__label">${i + 1}</span>
          <span class="journey-track__count">${pp.done}/${pp.total}</span>
        </li>
      `;
    }).join('');

    const tickBtn = $('tj-next-tick');
    if (!current) {
      setText('tj-next-text', 'All steps ticked off — nice work.');
      if (tickBtn) tickBtn.disabled = true;
      return;
    }
    setText('tj-next-text', current.step.title);
    if (tickBtn) {
      tickBtn.disabled = false;
      tickBtn.onclick = async () => {
        // Advance one task within the current step (the global first un-ticked task).
        const next = current.step.tasks.find((t) => !state.tasks[t.id]);
        if (next) {
          state.tasks[next.id] = true;
          await saveJourneyProgress(state);
        }
        renderJourneyTrack();
      };
    }
  } catch (e) {
    console.error('journey tile error', e);
    setText('tj-next-text', 'Failed to load journey.');
  }
}
