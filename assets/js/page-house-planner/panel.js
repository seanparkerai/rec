// panel.js — the control panel beside the canvas.
// Pure DOM building; every handler is injected so the module stays testable.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function fieldset(legendText) {
  const fs = el('fieldset', 'hp-group');
  fs.appendChild(el('legend', 'hp-legend', legendText));
  return fs;
}

function checkbox(id, labelText, checked, onChange) {
  const wrap = el('label', 'hp-check');
  const input = el('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.appendChild(input);
  wrap.appendChild(el('span', null, labelText));
  return wrap;
}

/**
 * @param {HTMLElement} host
 * @param {object} data building JSON
 * @param {object} handlers { onMode, onLevel, onRoof, onScenario, onWall }
 */
export function buildPanel(host, data, handlers) {
  host.replaceChildren();

  // --- Mode -----------------------------------------------------------
  const modeFs = fieldset('View');
  const group = el('div', 'hp-modes');
  group.setAttribute('role', 'group');
  const modes = [
    ['dollhouse', 'Dollhouse', 'Orbit the model from outside'],
    ['walk', 'Walkthrough', 'Move at eye height and look around'],
  ];
  const buttons = [];
  for (const [value, label, hint] of modes) {
    const b = el('button', 'hp-mode', label);
    b.type = 'button';
    b.title = hint;
    b.setAttribute('aria-pressed', String(value === 'dollhouse'));
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      handlers.onMode(value);
    });
    buttons.push(b);
    group.appendChild(b);
  }
  modeFs.appendChild(group);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  modeFs.appendChild(el('p', 'hp-hint', coarse
    ? 'Walkthrough: drag on the left of the view to walk, drag anywhere else to look.'
    : 'Walkthrough: click the view for mouse-look, WASD or arrow keys to move, Shift to hurry.'));
  host.appendChild(modeFs);

  // --- Floors ---------------------------------------------------------
  const floorFs = fieldset('Floors');
  for (const level of data.levels) {
    floorFs.appendChild(checkbox(`hp-lvl-${level.id}`, level.name, true,
      (on) => handlers.onLevel(level.id, on)));
  }
  floorFs.appendChild(checkbox('hp-roof', 'Roof', false, handlers.onRoof));
  floorFs.appendChild(checkbox('hp-windows', 'Windows', true, handlers.onWindows));
  host.appendChild(floorFs);

  // --- Scenarios ------------------------------------------------------
  const scenFs = fieldset('Scenario');
  const sel = el('select', 'hp-select');
  sel.id = 'hp-scenario';
  for (const s of data.scenarios ?? []) {
    const opt = el('option', null, s.name);
    opt.value = s.id;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => handlers.onScenario(sel.value));
  const selLabel = el('label', 'hp-field');
  selLabel.htmlFor = 'hp-scenario';
  selLabel.appendChild(el('span', 'hp-field-label', 'Preset'));
  selLabel.appendChild(sel);
  scenFs.appendChild(selLabel);

  const removable = data.walls.filter((w) => w.removable);
  const wallsWrap = el('div', 'hp-walls');
  wallsWrap.appendChild(el('p', 'hp-hint', 'Or take out individual walls:'));
  for (const w of removable) {
    const level = data.levels.find((l) => l.id === w.level);
    const label = w.note || `${level ? level.name : w.level} partition`;
    wallsWrap.appendChild(checkbox(`hp-w-${w.id}`, label, true,
      (on) => handlers.onWall(w.id, !on)));
  }
  scenFs.appendChild(wallsWrap);
  host.appendChild(scenFs);

  // --- What we are unsure about ---------------------------------------
  const noteFs = fieldset('Not yet verified');
  const list = el('ul', 'hp-assumptions');
  const rank = { high: 0, medium: 1, low: 2 };
  const sorted = [...(data.assumptions ?? [])].sort(
    (a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3),
  );
  for (const a of sorted) {
    const li = el('li', `hp-assumption hp-assumption--${a.severity}`);
    const det = el('details');
    const sum = el('summary');
    sum.appendChild(el('span', 'hp-sev', a.severity === 'high' ? 'Needs checking'
      : (a.severity === 'medium' ? 'Uncertain' : 'Minor')));
    sum.appendChild(el('span', 'hp-assumption-title', a.title));
    det.appendChild(sum);
    det.appendChild(el('p', 'hp-assumption-detail', a.detail));
    li.appendChild(det);
    list.appendChild(li);
  }
  noteFs.appendChild(list);
  host.appendChild(noteFs);

  return { setScenario: (id) => { sel.value = id; } };
}

/** Refresh the individual wall checkboxes to match a scenario's removals. */
export function syncWallChecks(data, removed) {
  for (const w of data.walls.filter((x) => x.removable)) {
    const input = document.getElementById(`hp-w-${w.id}`);
    if (input) input.checked = !removed.has(w.id);
  }
}
