// swings.js — where each door is hung and which way it opens.
//
// Pure plan-space geometry: no three.js, no DOM. Kept out of build.js so the
// rule can be exercised directly by the contract tests rather than inferred
// from the rendered model.

/** Plan-space room containing a point, or undefined. */
export function roomAt(rooms, level, px, py) {
  return rooms.find((r) => r.level === level
    && px > r.rect[0] && px < r.rect[2] && py > r.rect[1] && py < r.rect[3]);
}

const areaOf = (r) => (r ? (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]) : 0);

/** Do two plan segments cross? Used to keep a swung door out of a return wall. */
export function segmentsCross(p, p2, q, q2) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q, q2, p);
  const d2 = d(q, q2, p2);
  const d3 = d(p, p2, q);
  const d4 = d(p, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/**
 * Where each door is hung and which way it swings.
 *
 * Nothing here is measured — the plan was surveyed for openings, not for swing
 * arcs — so it follows the ordinary conventions and says so in `assumptions`:
 * hang the door into the nearer corner, open it into the larger adjoining room,
 * and open a cupboard-sized compartment outwards instead. A candidate that would
 * put the leaf through another wall is rejected in favour of the next one.
 * An opening may override all of it with `swing: { hinge, side, openDeg }`.
 */
export function resolveDoorSwings(data) {
  const out = new Map();
  const byWall = new Map(data.walls.map((w) => [w.id, w]));
  const SMALL_ROOM = 2.0;

  for (const o of data.openings) {
    if (o.type !== 'door') continue;
    const w = byWall.get(o.wall);
    if (!w) continue;
    const wlen = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (wlen < 0.01) continue;
    const ux = (w.b[0] - w.a[0]) / wlen;
    const uy = (w.b[1] - w.a[1]) / wlen;
    const cx = w.a[0] + ux * o.at;
    const cy = w.a[1] + uy * o.at;

    // Which side gets the swing: the larger adjoining room, unless that room is
    // no bigger than a cupboard, in which case the door opens away from it.
    const nx = -uy;
    const ny = ux;
    const probe = 0.6;
    const plus = roomAt(data.rooms, w.level, cx + nx * probe, cy + ny * probe);
    const minus = roomAt(data.rooms, w.level, cx - nx * probe, cy - ny * probe);
    let side = areaOf(plus) >= areaOf(minus) ? 1 : -1;
    const into = side > 0 ? plus : minus;
    if (into && areaOf(into) < SMALL_ROOM) side = -side;
    if (o.swing?.side) side = o.swing.side === 'left' ? 1 : -1;

    const hinge = o.swing?.hinge ?? (o.at <= wlen / 2 ? 'a' : 'b');
    const openDeg = o.swing?.openDeg ?? 72;
    const leaf = Math.max(0.1, o.width - 0.03);

    const candidate = (h, sd) => {
      const t = h === 'a' ? o.at - o.width / 2 : o.at + o.width / 2;
      const sign = h === 'a' ? 1 : -1;
      const th = (openDeg * Math.PI) / 180;
      const dx = sign * ux * Math.cos(th) + sd * nx * Math.sin(th);
      const dy = sign * uy * Math.cos(th) + sd * ny * Math.sin(th);
      const a = [w.a[0] + ux * t, w.a[1] + uy * t];
      return { a, b: [a[0] + dx * leaf, a[1] + dy * leaf], leaf };
    };

    const clear = (c) => {
      // Ignore the first 12cm so a leaf hinged in a corner does not read as
      // crossing the wall it is hinged against.
      const from = [c.a[0] + (c.b[0] - c.a[0]) * 0.12, c.a[1] + (c.b[1] - c.a[1]) * 0.12];
      return !data.walls.some((other) => other.id !== w.id && other.level === w.level
        && segmentsCross(from, c.b, other.a, other.b));
    };

    let chosen = null;
    for (const h of [hinge, hinge === 'a' ? 'b' : 'a']) {
      for (const sd of [side, -side]) {
        const c = candidate(h, sd);
        if (clear(c)) { chosen = c; break; }
      }
      if (chosen) break;
    }
    out.set(o.id, chosen ?? candidate(hinge, side));
  }
  return out;
}
