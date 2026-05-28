import { loadJSON } from '../data-loader.js';
import { _internal } from '../storage.js';
import { esc, byId as $, setText } from '../dom.js';

function journeyState() {
  return _internal.readLocal('journey-checks') || { viewing: {}, process: {}, moving: {} };
}

function itemLabel(section, item) {
  return section === 'moving' ? (item.task || '') : (item.item || '');
}

function findNextAction(checklists, state) {
  const order = ['viewing', 'process', 'moving'];
  for (const key of order) {
    const items = checklists?.[key] || [];
    for (let i = 0; i < items.length; i++) {
      if (!state[key]?.[i]) {
        return { section: key, index: i, title: itemLabel(key, items[i]) };
      }
    }
  }
  return null;
}

export async function renderJourneyTrack() {
  try {
    const data = await loadJSON('checklists');
    const state = journeyState();
    const sections = [
      { key: 'viewing', label: 'Viewing' },
      { key: 'process', label: 'Buying process' },
      { key: 'moving',  label: 'Moving' },
    ];
    const stats = sections.map((s) => {
      const items = data[s.key] || [];
      const total = items.length;
      const done = items.reduce((n, _, i) => n + (state[s.key]?.[i] ? 1 : 0), 0);
      return { ...s, total, done, isDone: total > 0 && done >= total };
    });
    const currentIdx = stats.findIndex((s) => !s.isDone);

    $('tj-track').innerHTML = stats.map((s, i) => {
      const mod = s.isDone ? '--done' : (i === currentIdx ? '--current' : '');
      return `
        <li class="journey-track__node ${mod ? 'journey-track__node' + mod : ''}">
          <span class="journey-track__label">${esc(s.label)}</span>
          <span class="journey-track__count">${s.done}/${s.total}</span>
        </li>
      `;
    }).join('');

    const next = findNextAction(data, state);
    const tickBtn = $('tj-next-tick');
    if (!next) {
      setText('tj-next-text', 'All steps ticked off — nice work.');
      if (tickBtn) tickBtn.disabled = true;
      return;
    }
    setText('tj-next-text', next.title);
    if (tickBtn) {
      tickBtn.disabled = false;
      tickBtn.onclick = () => {
        const fresh = journeyState();
        fresh[next.section] = fresh[next.section] || {};
        fresh[next.section][next.index] = true;
        _internal.writeLocal('journey-checks', fresh);
        renderJourneyTrack();
      };
    }
  } catch (e) {
    console.error('journey tile error', e);
    setText('tj-next-text', 'Failed to load journey.');
  }
}
