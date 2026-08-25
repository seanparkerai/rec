// build.js — turn the building JSON into three.js geometry.
// Pure: takes data + THREE, returns groups. No DOM, no state.
//
// Plan space is metres with x east-ish and y north-ish in the drawing's own
// frame; the whole model is rotated by site.planRotationDeg to reach true
// north. Plan (x, y) maps to world (x, height, -y).

import * as THREE from 'three';

const PALETTE = {
  external: 0xb08265,
  internal: 0xe6e0d8,
  party: 0x8d6a55,
  floor: 0xd9cfc2,
  roof: 0x5c6670,
  chimney: 0x9c5f47,
  garage: 0xc4a68c,
  annexe: 0xcbbfae,
  glass: 0x9fc4d8,
};

const v = (x, h, y) => new THREE.Vector3(x, h, -y);

function box(w, h, d, color, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Place a box spanning a plan segment a→b at a given height band. */
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

function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

/**
 * Build one wall, split around its openings.
 * Returns { meshes, collider } where collider is a plan-space AABB.
 */
function buildWall(wall, openings, level, defaults, THREE_) {
  const meshes = [];
  const thickness = wall.kind === 'internal'
    ? defaults.wallInternal
    : (wall.kind === 'party' ? defaults.wallParty : defaults.wallExternal);
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
    if (s > cursor) {
      meshes.push(segmentBox(lerp(wall.a, wall.b, cursor / len), lerp(wall.a, wall.b, s / len),
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
      const glass = segmentBox(pa, pb, thickness * 0.25, base + sill, head - sill, PALETTE.glass,
        { opacity: 0.35 });
      if (glass) { glass.userData.isGlass = true; meshes.push(glass); }
    }
    cursor = e / len;
  }
  if (cursor < 1) {
    meshes.push(segmentBox(lerp(wall.a, wall.b, cursor), wall.b, thickness, base, top, color));
  }

  const collider = {
    minX: Math.min(wall.a[0], wall.b[0]) - thickness / 2,
    maxX: Math.max(wall.a[0], wall.b[0]) + thickness / 2,
    minY: Math.min(wall.a[1], wall.b[1]) - thickness / 2,
    maxY: Math.max(wall.a[1], wall.b[1]) + thickness / 2,
    doorways: mine.filter((o) => o.type !== 'window'),
  };
  return { meshes: meshes.filter(Boolean), collider };
}

/** Hipped roof over an axis-aligned plan rectangle. */
function hippedRoof(minX, minY, maxX, maxY, eaves, pitchDeg, overhang, color) {
  const x0 = minX - overhang; const x1 = maxX + overhang;
  const y0 = minY - overhang; const y1 = maxY + overhang;
  const depth = y1 - y0;
  const width = x1 - x0;
  const rise = (Math.min(depth, width) / 2) * Math.tan((pitchDeg * Math.PI) / 180);
  const ridgeInset = Math.min(depth, width) / 2;
  const cy = (y0 + y1) / 2;

  const pts = [
    v(x0, eaves, y0), v(x1, eaves, y0), v(x1, eaves, y1), v(x0, eaves, y1),
    v(x0 + ridgeInset, eaves + rise, cy), v(x1 - ridgeInset, eaves + rise, cy),
  ];
  const idx = [
    0, 1, 5, 0, 5, 4,   // south slope
    2, 3, 4, 2, 4, 5,   // north slope
    1, 2, 5,            // east hip
    3, 0, 4,            // west hip
  ];
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(idx.length * 3);
  idx.forEach((p, i) => { arr[i * 3] = pts[p].x; arr[i * 3 + 1] = pts[p].y; arr[i * 3 + 2] = pts[p].z; });
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color, side: THREE.DoubleSide,
  }));
  mesh.castShadow = true;
  return { mesh, ridgeHeight: eaves + rise };
}

function bboxOfWalls(walls) {
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]);
  const ys = walls.flatMap((w) => [w.a[1], w.b[1]]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * Build the whole model.
 * @returns {{root: THREE.Group, levels: Map, roof: THREE.Group, colliders: Array}}
 */
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

  // Floor slabs, one per room.
  for (const room of data.rooms) {
    const level = byId.get(room.level);
    if (!level) continue;
    const [x0, y0, x1, y1] = room.rect;
    const slab = box(x1 - x0, data.defaults.floorThickness, y1 - y0, PALETTE.floor);
    slab.position.copy(v((x0 + x1) / 2, level.elevation - data.defaults.floorThickness / 2, (y0 + y1) / 2));
    slab.userData.room = room.id;
    levelGroups.get(room.level).add(slab);
  }

  // Walls.
  for (const wall of data.walls) {
    if (removed.has(wall.id)) continue;
    const level = byId.get(wall.level);
    if (!level) continue;
    const { meshes, collider } = buildWall(wall, data.openings, level, data.defaults, THREE);
    meshes.forEach((m) => { m.userData.wall = wall.id; levelGroups.get(wall.level).add(m); });
    collider.level = wall.level;
    colliders.push(collider);
  }

  // Chimney breasts.
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

  // Roof over the upper storey.
  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof';
  const topLevel = data.levels[data.levels.length - 1];
  const upperWalls = data.walls.filter((w) => w.level === topLevel.id && w.kind !== 'internal');
  const bb = bboxOfWalls(upperWalls);
  const eaves = topLevel.elevation + topLevel.ceilingHeight;
  const { mesh: roofMesh, ridgeHeight } = hippedRoof(
    bb.minX, bb.minY, bb.maxX, bb.maxY, eaves,
    data.roof.pitchDeg, data.roof.eavesOverhang, PALETTE.roof,
  );
  roofGroup.add(roofMesh);

  for (const chy of data.roof.chimneys ?? []) {
    const cx = bb.minX + (bb.maxX - bb.minX) * chy.atFraction;
    const stack = box(chy.width, ridgeHeight + chy.heightAboveRidge - eaves + 1.2, chy.depth, PALETTE.chimney);
    stack.position.copy(v(cx, (eaves + ridgeHeight + chy.heightAboveRidge) / 2 - 0.2, (bb.minY + bb.maxY) / 2));
    roofGroup.add(stack);
  }
  root.add(roofGroup);

  // Garage roof — the garage walls sit on the ground level.
  const garageWalls = data.walls.filter((w) => w.id.startsWith('gar-'));
  if (garageWalls.length) {
    const gb = bboxOfWalls(garageWalls);
    const gEaves = data.levels[0].elevation + data.levels[0].ceilingHeight;
    const { mesh } = hippedRoof(gb.minX, gb.minY, gb.maxX, gb.maxY, gEaves,
      data.roof.garage.pitchDeg, data.roof.eavesOverhang, PALETTE.roof);
    mesh.name = 'garage-roof';
    roofGroup.add(mesh);
  }

  // Attached single-storey structures.
  for (const s of data.structures ?? []) {
    const [x0, y0, x1, y1] = s.rect;
    const g = new THREE.Group();
    g.name = `structure-${s.id}`;
    const shell = box(x1 - x0, s.ceilingHeight, y1 - y0, PALETTE.annexe, { opacity: 0.85 });
    shell.position.copy(v((x0 + x1) / 2, s.ceilingHeight / 2, (y0 + y1) / 2));
    g.add(shell);
    const { mesh } = hippedRoof(x0, y0, x1, y1, s.ceilingHeight, s.roof.pitchDeg, 0.25, PALETTE.roof);
    g.add(mesh);
    g.userData.estimated = s.estimated === true;
    root.add(g);
    colliders.push({
      minX: x0, maxX: x1, minY: y0, maxY: y1, level: 'ground', doorways: [], solid: true,
    });
  }

  root.rotation.y = -((data.site.planRotationDeg ?? 0) * Math.PI) / 180;
  return { root, levels: levelGroups, roof: roofGroup, colliders, bbox: bb, ridgeHeight };
}

export { PALETTE };
