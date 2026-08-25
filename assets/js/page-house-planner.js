// page-house-planner.js — coordinator for the House planner page.
// Thin by design (§19): geometry lives in page-house-planner/build.js, the
// scene and controls in viewer.js, the panel in panel.js.

import { loadJSON } from './data-loader.js';
import { buildModel } from './page-house-planner/build.js';
import { Viewer } from './page-house-planner/viewer.js';
import { buildPanel, syncWallChecks } from './page-house-planner/panel.js';

const BUILDING = 'data/buildings/79-high-street.json';

async function init() {
  const stage = document.querySelector('[data-hp-stage]');
  const canvas = document.querySelector('[data-hp-canvas]');
  const panelHost = document.querySelector('[data-hp-panel]');
  const status = document.querySelector('[data-hp-status]');
  if (!canvas || !panelHost) return;

  let data;
  try {
    data = await loadJSON(BUILDING);
  } catch (err) {
    status.textContent = `Could not load the building model: ${err.message}`;
    return;
  }

  document.querySelectorAll('[data-hp-address]').forEach((n) => {
    n.textContent = `${data.address.line1}, ${data.address.locality}, ${data.address.postcode}`;
  });

  const viewer = new Viewer(canvas);
  const removed = new Set();

  const rebuild = () => {
    viewer.setModel(buildModel(data, { removed }));
    viewer.setRoofVisible(document.getElementById('hp-roof')?.checked ?? false);
    for (const level of data.levels) {
      const box = document.getElementById(`hp-lvl-${level.id}`);
      viewer.setLevelVisible(level.id, box ? box.checked : true);
    }
  };

  const panel = buildPanel(panelHost, data, {
    onMode: (mode) => {
      const at = data.spawn?.ground ?? { x: 4.94, y: 0.75 };
      viewer.spawn(at.x, at.y, data.levels[0].elevation, data.levels[0].id);
      viewer.setMode(mode);
      stage.classList.toggle('hp-stage--walking', mode === 'walk');
      status.textContent = mode === 'walk'
        ? 'Walkthrough — click the view to look around, WASD or arrow keys to move, Shift to hurry. Escape releases the cursor.'
        : 'Dollhouse — drag to orbit, scroll to zoom.';
    },
    onLevel: (id, on) => viewer.setLevelVisible(id, on),
    onRoof: (on) => viewer.setRoofVisible(on),
    onScenario: (id) => {
      const scenario = data.scenarios.find((s) => s.id === id);
      removed.clear();
      (scenario?.remove ?? []).forEach((w) => removed.add(w));
      syncWallChecks(data, removed);
      rebuild();
      status.textContent = `Showing: ${scenario ? scenario.name : id}.`;
    },
    onWall: (wallId, isRemoved) => {
      if (isRemoved) removed.add(wallId); else removed.delete(wallId);
      panel.setScenario('as-built');
      rebuild();
    },
  });

  rebuild();
  viewer.start();
  status.textContent = 'Dollhouse — drag to orbit, scroll to zoom.';

  // Walking the first floor means standing on it, not under it.
  document.addEventListener('keydown', (e) => {
    if (viewer.mode !== 'walk') return;
    if (e.key === '1' || e.key === '2') {
      const level = data.levels[Number(e.key) - 1];
      if (level) {
        const at = data.spawn?.[level.id] ?? { x: 4.94, y: 0.75 };
        viewer.spawn(at.x, at.y, level.elevation, level.id);
        status.textContent = `Walking the ${level.name.toLowerCase()}.`;
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
