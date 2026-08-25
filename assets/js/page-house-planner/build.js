// build.js — turn the building JSON into three.js geometry.
// Pure: takes data, returns groups. No DOM, no state.
//
// Plan space is metres, x running SW->NE and y running SE->NW in the drawing's
// own frame; the whole model is rotated so plan +y points at the real bearing
// in site.planNorthOffsetDeg. Plan (x, y) maps to world (x, height, -y).

import * as THREE from 'three';

const PALETTE = {
  external: 0xb08265,
  internal: 0xe6e0d8,
  floor: 0xd9cfc2,
  roof: 0x5c6670,
  leanTo: 0x6d7680,
  chimney: 0x9c5f47,
  annexe: 0xc9bcab,
  glass: 0x9fc4d8,
  stair: 0xbfae97,
  door: 0x8a6a4a,
};

const v = (x, h, y) => new THREE.Vector3(x, h, -y);

function box(w, h, d, color, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({
      color,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function segmentBox(a, b, thickness, base, height, color, opts) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len <= 0.001 || height <= 0.001) return null;
  const mesh = box(len, height, thickness, color, opts);
  mesh.position.copy(v((a[0] + b[0]) / 2, base + height / 2, (a[1] + b[1]) / 2));
  mesh.rotation.y = Math.atan2(dy, dx);
  return mesh;
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** One wall, split around its openings. Returns meshes + a plan-space collider. */
function buildWall(wall, openings, level, defaults) {
  const meshes = [];
  const thickness = wall.kind === 'internal' ? defaults.wallInternal : defaults.wallExternal;
  const color = PALETTE[wall.kind] ?? PALETTE.internal;
  const base = level.elevation;
  const top = level.ceilingHeight;
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);

  const mine = openings
    .filter((o) => o.wall === wall.id)
    .map((o) => ({ ...o, start: o.at - o.width / 2, end: o.at + o.width / 2 }))
    .sort((x, y) => x.start - y.start);

  let cursor = 0;
  for (const o of mine) {
    const s = Math.max(0, o.start);
    const e = Math.min(len, o.end);
    if (s / len > cursor) {
      meshes.push(segmentBox(lerp(wall.a, wall.b, cursor), lerp(wall.a, wall.b, s / len),
        thickness, base, top, color));
    }
    const head = o.type === 'garage' ? defaults.garageDoorHeight
      : (o.type === 'door' ? defaults.doorHeight : defaults.windowHead);
    const sill = o.type === 'window' ? defaults.windowSill : 0;
    const pa = lerp(wall.a, wall.b, s / len);
    const pb = lerp(wall.a, wall.b, e / len);
    if (sill > 0) meshes.push(segmentBox(pa, pb, thickness, base, sill, color));
    if (top > head) meshes.push(segmentBox(pa, pb, thickness, base + head, top - head, color));
    if (o.type === 'window') {
      meshes.push(segmentBox(pa, pb, thickness * 0.25, base + sill, head - sill,
        PALETTE.glass, { opacity: 0.35 }));
    } else if (o.type === 'garage') {
      meshes.push(segmentBox(pa, pb, thickness * 0.4, base, head, PALETTE.door, { opacity: 0.95 }));
    }
    cursor = e / len;
  }
  if (cursor < 1) {
    meshes.push(segmentBox(lerp(wall.a, wall.b, cursor), wall.b, thickness, base, top, color));
  }

  return {
    meshes: meshes.filter(Boolean),
    collider: {
      level: wall.level,
      minX: Math.min(wall.a[0], wall.b[0]) - thickness / 2,
      maxX: Math.max(wall.a[0], wall.b[0]) + thickness / 2,
      minY: Math.min(wall.a[1], wall.b[1]) - thickness / 2,
      maxY: Math.max(wall.a[1], wall.b[1]) + thickness / 2,
      horizontal: Math.abs(wall.b[0] - wall.a[0]) >= Math.abs(wall.b[1] - wall.a[1]),
      origin: wall.a,
      doorways: mine.filter((o) => o.type !== 'window'),
    },
  };
}

function meshFrom(points, indices, color, opts = {}) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(indices.length * 3);
  indices.forEach((p, i) => {
    arr[i * 3] = points[p].x; arr[i * 3 + 1] = points[p].y; arr[i * 3 + 2] = points[p].z;
  });
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color, side: THREE.DoubleSide, ...opts,
  }));
  mesh.castShadow = true;
  return mesh;
}

/** Hipped or mono-pitch roof over a plan rectangle. */
function buildRoof(spec, color) {
  const [rx0, ry0, rx1, ry1] = spec.rect;
  const o = spec.overhang ?? 0.3;
  const x0 = rx0 - o; const x1 = rx1 + o;
  const y0 = ry0 - o; const y1 = ry1 + o;
  const e = spec.eaves;
  const tan = Math.tan((spec.pitchDeg * Math.PI) / 180);

  if (spec.type === 'monopitch') {
    const span = (spec.highSide === 'minY' || spec.highSide === 'maxY') ? (y1 - y0) : (x1 - x0);
    const rise = span * tan;
    const hi = e + rise;
    let pts;
    if (spec.highSide === 'minY') pts = [v(x0, hi, y0), v(x1, hi, y0), v(x1, e, y1), v(x0, e, y1)];
    else if (spec.highSide === 'maxY') pts = [v(x0, e, y0), v(x1, e, y0), v(x1, hi, y1), v(x0, hi, y1)];
    else if (spec.highSide === 'maxX') pts = [v(x0, e, y0), v(x1, hi, y0), v(x1, hi, y1), v(x0, e, y1)];
    else pts = [v(x0, hi, y0), v(x1, e, y0), v(x1, e, y1), v(x0, hi, y1)];
    return { mesh: meshFrom(pts, [0, 1, 2, 0, 2, 3], color), top: hi };
  }

  // Hipped: ridge runs along the longer axis, inset by half the shorter span.
  const w = x1 - x0; const dpt = y1 - y0;
  const inset = Math.min(w, dpt) / 2;
  const rise = inset * tan;
  const ridge = e + rise;
  let pts; let idx;
  if (w >= dpt) {
    const cy = (y0 + y1) / 2;
    pts = [v(x0, e, y0), v(x1, e, y0), v(x1, e, y1), v(x0, e, y1),
      v(x0 + inset, ridge, cy), v(x1 - inset, ridge, cy)];
    idx = [0, 1, 5, 0, 5, 4, 2, 3, 4, 2, 4, 5, 1, 2, 5, 3, 0, 4];
  } else {
    const cx = (x0 + x1) / 2;
    pts = [v(x0, e, y0), v(x1, e, y0), v(x1, e, y1), v(x0, e, y1),
      v(cx, ridge, y0 + inset), v(cx, ridge, y1 - inset)];
    idx = [0, 1, 4, 1, 2, 5, 1, 5, 4, 2, 3, 5, 3, 0, 4, 3, 4, 5];
  }
  return { mesh: meshFrom(pts, idx, color), top: ridge };
}

/** The straight flight as drawn, plus the winder that turns onto the landing. */
function buildStairs(spec, levels) {
  const g = new THREE.Group();
  g.name = 'stairs';
  const from = levels[0];
  const to = levels[1];
  const total = spec.straightRisers + (spec.winderRisers ?? 0);
  const rise = (to.elevation - from.elevation) / total;
  const [x0, y0, x1, y1] = spec.footprint;
  const width = Math.min(spec.width, x1 - x0);
  const cx = (x0 + x1) / 2;

  for (let i = 0; i < spec.straightRisers; i += 1) {
    const step = box(width, rise, spec.treadGoing, PALETTE.stair);
    step.position.copy(v(cx, from.elevation + rise * (i + 0.5), y0 + spec.treadGoing * (i + 0.5)));
    g.add(step);
  }
  // The winder turns in the square at the head of the flight, so its treads are
  // stacked in place rather than marching on down the hall.
  const headY = y0 + spec.straightRisers * spec.treadGoing;
  const quarter = Math.max(0.6, y1 - headY);
  for (let i = 0; i < (spec.winderRisers ?? 0); i += 1) {
    const step = box(width, rise, quarter, PALETTE.stair);
    step.position.copy(v(cx, from.elevation + rise * (spec.straightRisers + i + 0.5), headY + quarter / 2));
    g.add(step);
  }
  const rail = box(0.06, 0.9, spec.straightRisers * spec.treadGoing, PALETTE.door);
  rail.position.copy(v(cx - width / 2, from.elevation + 1.5, y0 + (spec.straightRisers * spec.treadGoing) / 2));
  g.add(rail);
  return g;
}

/** The land parcel, drawn as a line on the ground plane. */
function buildPlot(plot) {
  const g = new THREE.Group();
  g.name = 'plot';
  const pts = plot.polygon.map(([px, py]) => v(px, -0.14, py));
  pts.push(pts[0]);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3f7d4f })));
  // A translucent fill so the parcel reads as ground, not as a floating outline.
  const shape = new THREE.Shape(plot.polygon.map(([px, py]) => new THREE.Vector2(px, -py)));
  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: 0x6f9c6f, transparent: true, opacity: 0.18 }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = -0.15;
  g.add(fill);
  return g;
}

function bboxOf(rects) {
  return {
    minX: Math.min(...rects.map((r) => r[0])), minY: Math.min(...rects.map((r) => r[1])),
    maxX: Math.max(...rects.map((r) => r[2])), maxY: Math.max(...rects.map((r) => r[3])),
  };
}

export function buildModel(data, { removed = new Set() } = {}) {
  const root = new THREE.Group();
  const levelGroups = new Map();
  const colliders = [];
  const byId = new Map(data.levels.map((l) => [l.id, l]));

  for (const level of data.levels) {
    const g = new THREE.Group();
    g.name = `level-${level.id}`;
    levelGroups.set(level.id, g);
    root.add(g);
  }

  for (const room of data.rooms) {
    const level = byId.get(room.level);
    if (!level) continue;
    const [x0, y0, x1, y1] = room.rect;
    const slab = box(x1 - x0, data.defaults.floorThickness, y1 - y0, PALETTE.floor);
    slab.position.copy(v((x0 + x1) / 2, level.elevation - data.defaults.floorThickness / 2, (y0 + y1) / 2));
    slab.userData.room = room.id;
    levelGroups.get(room.level).add(slab);
  }

  for (const wall of data.walls) {
    if (removed.has(wall.id)) continue;
    const level = byId.get(wall.level);
    if (!level) continue;
    const { meshes, collider } = buildWall(wall, data.openings, level, data.defaults);
    meshes.forEach((m) => { m.userData.wall = wall.id; levelGroups.get(wall.level).add(m); });
    colliders.push(collider);
  }

  for (const f of data.features ?? []) {
    if (f.type !== 'chimneyBreast') continue;
    const room = data.rooms.find((r) => r.id === f.room);
    const level = byId.get(room?.level);
    if (!room || !level) continue;
    const [x0, y0, x1] = room.rect;
    const b = box(f.width, level.ceilingHeight, f.projection, PALETTE.chimney);
    b.position.copy(v((x0 + x1) / 2, level.elevation + level.ceilingHeight / 2, y0 + f.projection / 2));
    levelGroups.get(room.level).add(b);
  }

  if (data.stairs) {
    levelGroups.get(data.stairs.level).add(buildStairs(data.stairs, data.levels));
  }
  if (data.plot) root.add(buildPlot(data.plot));

  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof';
  for (const spec of data.roofs ?? []) {
    const { mesh } = buildRoof(spec, spec.type === 'monopitch' ? PALETTE.leanTo : PALETTE.roof);
    mesh.name = spec.id;
    roofGroup.add(mesh);
  }
  for (const chy of data.roof?.chimneys ?? []) {
    const base = chy.base ?? 0;
    const h = chy.top - base;
    const stack = box(chy.width, h, chy.depth, PALETTE.chimney);
    stack.position.copy(v(chy.x, base + h / 2, chy.y));
    roofGroup.add(stack);
  }
  root.add(roofGroup);

  for (const s of data.structures ?? []) {
    const [x0, y0, x1, y1] = s.rect;
    const g = new THREE.Group();
    g.name = `structure-${s.id}`;
    const shell = box(x1 - x0, s.ceilingHeight, y1 - y0, PALETTE.annexe, { opacity: 0.9 });
    shell.position.copy(v((x0 + x1) / 2, s.ceilingHeight / 2, (y0 + y1) / 2));
    g.add(shell);
    const { mesh } = buildRoof(
      { ...s.roof, rect: s.rect, eaves: s.ceilingHeight, overhang: 0.25 },
      PALETTE.roof,
    );
    g.add(mesh);
    g.userData.estimated = s.estimated === true;
    root.add(g);
    colliders.push({ minX: x0, maxX: x1, minY: y0, maxY: y1, level: 'ground', doorways: [], solid: true });
  }

  // plan +y should point at the real-world bearing in planNorthOffsetDeg.
  const bearing = data.site.planNorthOffsetDeg ?? 0;
  root.rotation.y = (bearing * Math.PI) / 180;

  return {
    root, levels: levelGroups, roof: roofGroup, colliders,
    bbox: bboxOf(data.rooms.map((r) => r.rect)),
  };
}

export { PALETTE, buildRoof };
