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
  brick: 0xa8705a,
  frame: 0xf4f2ed,
  gate: 0x2f5d3f,
  hedge: 0x4a6b41,
  gravel: 0xd6cfbf,
  garageDoor: 0xefebe2,
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
function buildWall(wall, openings, level, defaults, wallHeight) {
  const meshes = [];
  const thickness = wall.kind === 'internal' ? defaults.wallInternal : defaults.wallExternal;
  const color = PALETTE[wall.kind] ?? PALETTE.internal;
  const base = level.elevation;
  const top = wall.height ?? wallHeight ?? level.ceilingHeight;
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
      const glass = segmentBox(pa, pb, thickness * 0.25, base + sill, head - sill,
        PALETTE.glass, { opacity: 0.3 });
      if (glass) { glass.userData.glazing = true; meshes.push(glass); }

      // Frame, mullions and transom, so a window reads as a window rather than
      // a tinted hole. Bar positions are fractions along the opening.
      const wlen = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      const hgt = head - sill;
      const BAR = 0.05;
      const bt = thickness * 0.34;
      const addBar = (t0, t1, yOff, yH) => {
        const m = segmentBox(lerp(pa, pb, t0), lerp(pa, pb, t1), bt, base + yOff, yH, PALETTE.frame);
        if (m) { m.userData.glazing = true; meshes.push(m); }
      };
      if (wlen > 0.2) {
        const fr = BAR / wlen;
        addBar(0, 1, sill, BAR);              // cill
        addBar(0, 1, head - BAR, BAR);        // head
        addBar(0, fr, sill, hgt);             // jambs
        addBar(1 - fr, 1, sill, hgt);
        const lights = Math.max(2, Math.round(wlen / 0.55));
        for (let i = 1; i < lights; i += 1) {
          const f = i / lights;
          addBar(f - fr / 2, f + fr / 2, sill, hgt);
        }
        addBar(0, 1, sill + hgt * 0.68, BAR); // transom
      }
    } else if (o.type === 'garage') {
      meshes.push(segmentBox(pa, pb, thickness * 0.4, base, head,
        PALETTE.garageDoor, { opacity: 1 }));
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
  // Per-edge overhangs: an edge that runs into another roof or a wall takes 0,
  // otherwise two abutting roofs overlap and read as a stray flap of eaves.
  const oh = spec.overhangs ?? {};
  const x0 = rx0 - (oh.minX ?? o); const x1 = rx1 + (oh.maxX ?? o);
  const y0 = ry0 - (oh.minY ?? o); const y1 = ry1 + (oh.maxY ?? o);
  const e = spec.eaves;
  const tan = Math.tan((spec.pitchDeg * Math.PI) / 180);

  if (spec.type === 'gable') {
    const alongY = (spec.ridgeAxis ?? 'ns') === 'ns';
    const rise = ((alongY ? (x1 - x0) : (y1 - y0)) / 2) * tan;
    const h = e + rise;
    let pts; let idx;
    if (alongY) {
      const cx = (x0 + x1) / 2;
      pts = [v(x0, e, y0), v(x1, e, y0), v(x1, e, y1), v(x0, e, y1),
        v(cx, h, y0), v(cx, h, y1)];
      idx = [0, 4, 5, 0, 5, 3, 1, 2, 5, 1, 5, 4, 0, 1, 4, 3, 5, 2];
    } else {
      const cy = (y0 + y1) / 2;
      pts = [v(x0, e, y0), v(x1, e, y0), v(x1, e, y1), v(x0, e, y1),
        v(x0, h, cy), v(x1, h, cy)];
      idx = [0, 1, 5, 0, 5, 4, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
    }
    return { mesh: meshFrom(pts, idx, color), top: h };
  }

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

  // An `abut` edge meets a wall, so the ridge runs right out to it and that end
  // closes as a vertical gable instead of a hip. Without this a near-square
  // footprint like the garage collapses into a pyramid.
  if (spec.abut === 'maxY') {
    // Porch canopy: ridge runs out from the wall, hipped on its three free sides.
    const cx = (x0 + x1) / 2;
    const inset = Math.min(x1 - x0, y1 - y0) / 2;
    const h = e + inset * tan;
    const pts2 = [v(x0, e, y0), v(x1, e, y0), v(x1, e, y1), v(x0, e, y1),
      v(cx, h, y1), v(cx, h, y0 + inset)];
    const idx2 = [0, 5, 4, 0, 4, 3, 1, 2, 4, 1, 4, 5, 0, 1, 5, 3, 4, 2];
    return { mesh: meshFrom(pts2, idx2, color), top: h };
  }

  if (spec.abut === 'minX') {
    const cy = (y0 + y1) / 2;
    const pts2 = [v(x0, e, y0), v(x1, e, y0), v(x1, e, y1), v(x0, e, y1),
      v(x0, ridge, cy), v(x1 - inset, ridge, cy)];
    const idx2 = [
      0, 1, 5, 0, 5, 4,   // slope towards minY
      2, 3, 4, 2, 4, 5,   // slope towards maxY
      1, 2, 5,            // hip at the free end
      3, 0, 4,            // gable against the wall
    ];
    return { mesh: meshFrom(pts2, idx2, color), top: ridge };
  }

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
  // Handrail raked along the flight. The old one was a flat panel at a fixed
  // height, which read as a plank floating beside the stairs.
  const run = spec.straightRisers * spec.treadGoing;
  const climbed = spec.straightRisers * rise;
  const railLen = Math.hypot(run, climbed);
  const rail = box(0.055, 0.075, railLen, PALETTE.stair);
  rail.position.copy(v(cx - width / 2 + 0.03,
    from.elevation + climbed / 2 + 0.92, y0 + run / 2));
  rail.rotation.x = Math.atan2(climbed, run);
  g.add(rail);
  for (let i = 0; i <= 3; i += 1) {
    const t = i / 3;
    const postH = 0.92 + rise * 0.5;
    const post = box(0.05, postH, 0.05, PALETTE.stair);
    post.position.copy(v(cx - width / 2 + 0.03,
      from.elevation + climbed * t + postH / 2, y0 + run * t));
    g.add(post);
  }
  return g;
}

/** The land parcel, drawn as a line on the ground plane. */
function buildPlot(plot) {
  const g = new THREE.Group();
  g.name = 'plot';
  const pts = plot.polygon.map(([px, py]) => v(px, -0.34, py));
  pts.push(pts[0]);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3f7d4f })));
  // A translucent fill so the parcel reads as ground, not as a floating outline.
  // Shape lies in XY; rotating -90 about X sends (x, y) to (x, 0, -y), which is
  // exactly what v() does. Negating y here would mirror the fill off the outline.
  const shape = new THREE.Shape(plot.polygon.map(([px, py]) => new THREE.Vector2(px, py)));
  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: 0x6f9c6f, transparent: true, opacity: 0.18 }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = -0.35;
  g.add(fill);
  return g;
}


/**
 * Height of a roof surface at a plan point, or null if the point is not under it.
 * Used so a chimney emerges from the roof rather than from the eaves.
 */
function roofHeightAt(spec, px, py) {
  const o = spec.overhang ?? 0.3;
  const oh = spec.overhangs ?? {};
  const x0 = spec.rect[0] - (oh.minX ?? o);
  const x1 = spec.rect[2] + (oh.maxX ?? o);
  const y0 = spec.rect[1] - (oh.minY ?? o);
  const y1 = spec.rect[3] + (oh.maxY ?? o);
  if (px < x0 || px > x1 || py < y0 || py > y1) return null;
  const tan = Math.tan((spec.pitchDeg * Math.PI) / 180);
  const e = spec.eaves;

  if (spec.type === 'monopitch') {
    const span = (spec.highSide === 'minY' || spec.highSide === 'maxY') ? (y1 - y0) : (x1 - x0);
    let d;
    if (spec.highSide === 'minY') d = y1 - py;
    else if (spec.highSide === 'maxY') d = py - y0;
    else if (spec.highSide === 'maxX') d = px - x0;
    else d = x1 - px;
    return e + (span - (span - d)) * tan * 0 + d * tan;
  }
  // Hip and gable: rise with distance from whichever eaves edge is nearest,
  // capped at the ridge. An abutting edge is not an eaves, so it does not count.
  const dists = [];
  if (spec.abut !== 'minX') dists.push(px - x0);
  dists.push(x1 - px);
  dists.push(py - y0);
  if (spec.abut !== 'maxY') dists.push(y1 - py);
  if (spec.type === 'gable') {
    const alongY = (spec.ridgeAxis ?? 'ns') === 'ns';
    const d = alongY ? Math.min(px - x0, x1 - px) : Math.min(py - y0, y1 - py);
    const cap = (alongY ? (x1 - x0) : (y1 - y0)) / 2;
    return e + Math.min(d, cap) * tan;
  }
  const cap = Math.min(x1 - x0, y1 - y0) / 2;
  return e + Math.min(Math.min(...dists), cap) * tan;
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
  const glazing = [];
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

  // Height a level's walls rise to: the floor of the storey above, where there
  // is one, so nothing shows through the structural zone between floors.
  const wallTopFor = new Map();
  data.levels.forEach((l, i) => {
    const next = data.levels[i + 1];
    wallTopFor.set(l.id, next ? next.elevation - l.elevation : l.ceilingHeight);
  });

  for (const wall of data.walls) {
    if (removed.has(wall.id)) continue;
    const level = byId.get(wall.level);
    if (!level) continue;
    const { meshes, collider } = buildWall(
      wall, data.openings, level, data.defaults, wallTopFor.get(wall.level),
    );
    meshes.forEach((m) => {
      m.userData.wall = wall.id;
      if (m.userData.glazing) glazing.push(m);
      levelGroups.get(wall.level).add(m);
    });
    colliders.push(collider);
  }

  for (const f of data.features ?? []) {
    if (f.type !== 'chimneyBreast') continue;
    const room = data.rooms.find((r) => r.id === f.room);
    const level = byId.get(room?.level);
    if (!room || !level) continue;
    const [x0, y0, x1, y1] = room.rect;
    // A breast sits against the wall named by `side`. Ignoring this put every
    // breast on the front wall, standing in front of the windows.
    const p = f.projection;
    // `centre` positions the breast along its wall. Without it a breast is
    // centred in the room, which put one of them across a doorway.
    let bw; let bd; let cx; let cy;
    if (f.side === 'maxX') { bw = p; bd = f.width; cx = x1 - p / 2; cy = f.centre ?? (y0 + y1) / 2; }
    else if (f.side === 'minX') { bw = p; bd = f.width; cx = x0 + p / 2; cy = f.centre ?? (y0 + y1) / 2; }
    else if (f.side === 'maxY') { bw = f.width; bd = p; cx = f.centre ?? (x0 + x1) / 2; cy = y1 - p / 2; }
    else { bw = f.width; bd = p; cx = f.centre ?? (x0 + x1) / 2; cy = y0 + p / 2; }
    const b = box(bw, level.ceilingHeight, bd, PALETTE.chimney);
    b.position.copy(v(cx, level.elevation + level.ceilingHeight / 2, cy));
    levelGroups.get(room.level).add(b);
  }

  if (data.stairs) {
    levelGroups.get(data.stairs.level).add(buildStairs(data.stairs, data.levels));
  }
  if (data.plot) root.add(buildPlot(data.plot));

  // Brick boundary walls to the road frontage — the owner's, and the clearest
  // read of where the land actually ends.
  if (data.boundaryWalls) {
    const bw = data.boundaryWalls;
    const g = new THREE.Group();
    g.name = 'boundary-walls';
    for (const seg of bw.segments) {
      const mesh = segmentBox(seg.a, seg.b, bw.thickness, 0, bw.height, PALETTE.brick);
      if (mesh) g.add(mesh);
      // Rounded coping on the straight runs, as the photographs show.
      const cap = segmentBox(seg.a, seg.b, bw.thickness + 0.05, bw.height, 0.06, PALETTE.brick);
      if (cap) g.add(cap);
    }

    for (const gate of bw.gates ?? []) {
      const len = Math.hypot(gate.b[0] - gate.a[0], gate.b[1] - gate.a[1]);
      const h = gate.height;
      const add = (t0, t1, base, height, thick) => {
        const m = segmentBox(lerp(gate.a, gate.b, t0), lerp(gate.a, gate.b, t1),
          thick, base, height, PALETTE.gate);
        if (m) g.add(m);
      };
      const postW = 0.1 / len;
      add(0, postW, 0, h + 0.12, 0.1);            // hanging post
      add(1 - postW, 1, 0, h + 0.12, 0.1);        // slamming post
      if (gate.kind === 'fivebar') {
        for (let i = 0; i < 5; i += 1) {
          add(0, 1, 0.12 + i * ((h - 0.2) / 4), 0.07, 0.05);
        }
        // Diagonal brace, raked across the opening.
        const brace = box(0.05, 0.06, Math.hypot(len, h - 0.3), PALETTE.gate);
        brace.position.copy(v((gate.a[0] + gate.b[0]) / 2, h / 2, (gate.a[1] + gate.b[1]) / 2));
        brace.rotation.y = Math.atan2(gate.b[1] - gate.a[1], gate.b[0] - gate.a[0]) + Math.PI / 2;
        brace.rotation.x = Math.atan2(h - 0.3, len);
        g.add(brace);
      } else {
        const palings = Math.max(4, Math.round(len / 0.13));
        for (let i = 0; i < palings; i += 1) {
          const f = (i + 0.5) / palings;
          add(f - 0.035 / len, f + 0.035 / len, 0, h, 0.04);
        }
        add(0, 1, h - 0.22, 0.06, 0.05);
        add(0, 1, 0.25, 0.06, 0.05);
      }
    }
    // Tall clipped hedge standing inside the frontage wall.
    const hedge = bw.hedge;
    if (hedge) {
      for (const run of hedge.runs) {
        const dx = run.b[0] - run.a[0];
        const dy = run.b[1] - run.a[1];
        const rl = Math.hypot(dx, dy) || 1;
        const nx = (-dy / rl) * hedge.offset;
        const ny = (dx / rl) * hedge.offset;
        const m = segmentBox([run.a[0] + nx, run.a[1] + ny], [run.b[0] + nx, run.b[1] + ny],
          hedge.thickness, 0, hedge.height, PALETTE.hedge);
        if (m) g.add(m);
      }
    }
    root.add(g);
  }

  // Ground surfaces — the gravel drive. Drawn above the plot fill but below the
  // floor slabs, so it reads as ground the buildings stand on.
  for (const surf of data.surfaces ?? []) {
    const shape = new THREE.Shape(surf.polygon.map(([px, py]) => new THREE.Vector2(px, py)));
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshLambertMaterial({ color: PALETTE.gravel }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.31;
    mesh.name = `surface-${surf.id}`;
    root.add(mesh);
  }

  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof';
  for (const spec of data.roofs ?? []) {
    const { mesh } = buildRoof(spec, spec.type === 'monopitch' ? PALETTE.leanTo : PALETTE.roof);
    mesh.name = spec.id;
    roofGroup.add(mesh);
  }
  for (const chy of data.roof?.chimneys ?? []) {
    // Start the stack just under the roof surface it comes through, so only the
    // part that should be visible stands proud.
    const surfaces = (data.roofs ?? [])
      .map((r) => roofHeightAt(r, chy.x, chy.y))
      .filter((h) => h != null);
    const base = surfaces.length ? Math.max(...surfaces) - 0.25 : (chy.base ?? 0);
    const h = Math.max(0.4, chy.top - base);
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
    root, levels: levelGroups, roof: roofGroup, colliders, glazing,
    bbox: bboxOf(data.rooms.map((r) => r.rect)),
  };
}

export { PALETTE, buildRoof };
