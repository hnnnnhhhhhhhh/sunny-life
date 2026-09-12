export const HOUSE_FLOOR = 0.25;
export const HOUSE_WINDOW = Object.freeze({
  bottom: 0.86,
  top: 2.65,
  height: 1.79,
  center: 1.755,
  frame: 0.075,
});

export const WALL_HEIGHT = 3.1;
export const PLOT = { x: 10.5, z: 8.5 };
export const EXTERIOR_IDS = ['exterior-north', 'exterior-west', 'exterior-east', 'exterior-south'];

export function floorRegions(home) {
  return [
    ...(home.foundation === false ? [] : [{ id: 'foundation', x1: -home.width / 2, x2: home.width / 2, z1: -home.depth / 2, z2: home.depth / 2 }]),
    ...(home.rooms || []),
  ];
}

export function onFloor(home, x, z, margin = 0) {
  return floorRegions(home).some(r => x >= r.x1 - margin && x <= r.x2 + margin && z >= r.z1 - margin && z <= r.z2 + margin);
}

export function exteriorRecords(home) {
  if (home.foundation === false) return [];
  const w = home.width / 2, d = home.depth / 2;
  return [
    { id: EXTERIOR_IDS[0], x1: -w, z1: -d, x2: w, z2: -d, openings: [-w / 2, w / 2].map(position => ({ kind: 'window', position, width: 2.4 })) },
    { id: EXTERIOR_IDS[1], x1: -w, z1: -d, x2: -w, z2: d, openings: [{ kind: 'window', position: 0, width: 2.6 }] },
    { id: EXTERIOR_IDS[2], x1: w, z1: -d, x2: w, z2: d, openings: [{ kind: 'door', position: 1, width: 1.5 }] },
    { id: EXTERIOR_IDS[3], x1: -w, z1: d, x2: w, z2: d, openings: [{ kind: 'door', position: 0, width: 1.7 }] },
  ].filter(wall => !(home.removedExterior || []).includes(wall.id))
    .map(wall => {
      const edit = home.exteriorEdits?.[wall.id];
      return { ...wall, ...(edit ? { kind: edit.kind, opening: edit.opening } : {}), exterior: true };
    });
}

export function allWalls(home) {
  return [...exteriorRecords(home), ...home.walls];
}

export function wallAxis(wall) {
  const horizontal = wall.z1 === wall.z2;
  const a = horizontal ? wall.x1 : wall.z1, b = horizontal ? wall.x2 : wall.z2;
  return { horizontal, start: Math.min(a, b), end: Math.max(a, b), fixed: horizontal ? wall.z1 : wall.x1 };
}

export function wallOpenings(wall) {
  if (!wall.kind) return wall.openings || [];
  if (wall.kind === 'wall') return [];
  const axis = wallAxis(wall);
  return [{ kind: wall.kind, position: wall.opening ?? (axis.start + axis.end) / 2, width: wall.kind === 'door' ? 1.5 : 1.4 }];
}

export function wallRect(wall, start, end) {
  const axis = wallAxis(wall);
  return {
    x: axis.horizontal ? (start + end) / 2 : axis.fixed,
    z: axis.horizontal ? axis.fixed : (start + end) / 2,
    width: axis.horizontal ? end - start : 0.18,
    depth: axis.horizontal ? 0.18 : end - start,
  };
}

// Ground-level collision and visible wall pieces share the same opening extents.
export function wallParts(wall, collisionOnly = false) {
  const axis = wallAxis(wall), parts = [];
  const openings = wallOpenings(wall).filter(o => !collisionOnly || o.kind === 'door')
    .sort((a, b) => a.position - b.position);
  let cursor = axis.start;
  const add = (start, end, bottom, top) => {
    if (end - start > 0.001 && top > bottom) parts.push({ ...wallRect(wall, start, end), bottom, top, wallId: wall.id });
  };
  for (const opening of openings) {
    const a = Math.max(axis.start, Math.min(axis.end, opening.position - opening.width / 2));
    const b = Math.max(a, Math.min(axis.end, opening.position + opening.width / 2));
    add(cursor, a, 0, WALL_HEIGHT);
    if (!collisionOnly) {
      if (opening.kind === 'window') add(a, b, 0, HOUSE_WINDOW.bottom);
      add(a, b, opening.kind === 'door' ? 2.45 : HOUSE_WINDOW.top, WALL_HEIGHT);
    }
    cursor = Math.max(cursor, b);
  }
  add(cursor, axis.end, 0, WALL_HEIGHT);
  return parts;
}

export function wallColliders(home) {
  return allWalls(home).flatMap(wall => wallParts(wall, true));
}

export function roomFromPoints(start, end, id) {
  return { id, x1: Math.min(start.x, end.x), z1: Math.min(start.z, end.z), x2: Math.max(start.x, end.x), z2: Math.max(start.z, end.z) };
}

export function roomWalls(room) {
  const { id, x1, z1, x2, z2 } = room;
  return [
    { id: `${id}-north`, x1, z1, x2, z2: z1 },
    { id: `${id}-west`, x1, z1, x2: x1, z2 },
    { id: `${id}-east`, x1: x2, z1, x2, z2 },
    { id: `${id}-south`, x1, z1: z2, x2, z2, kind: 'door' },
  ].map(wall => ({ ...wall, roomId: id }));
}

export function sharedWall(a, b) {
  const aa = wallAxis(a), bb = wallAxis(b);
  return aa.horizontal === bb.horizontal && Math.abs(aa.fixed - bb.fixed) < 0.01 &&
    aa.start >= bb.start - 0.01 && aa.end <= bb.end + 0.01;
}

export function removeWall(home, id) {
  return id.startsWith('exterior-')
    ? { ...home, removedExterior: [...new Set([...(home.removedExterior || []), id])] }
    : { ...home, walls: home.walls.filter(wall => wall.id !== id) };
}

export function setWallOpening(home, id, kind, point) {
  const wall = allWalls(home).find(w => w.id === id);
  if (!wall) return { error: '墙体已经不存在了' };
  const axis = wallAxis(wall), width = kind === 'door' ? 1.5 : 1.4;
  if (axis.end - axis.start < width + 0.3) return { error: '墙段太短，请选择至少 2 米的墙体' };
  const value = axis.horizontal ? point.x : point.z;
  const opening = Math.max(axis.start + width / 2 + 0.15, Math.min(axis.end - width / 2 - 0.15, value));
  const edit = { kind, opening };
  return { home: wall.exterior
    ? { ...home, exteriorEdits: { ...home.exteriorEdits, [id]: edit } }
    : { ...home, walls: home.walls.map(w => w.id === id ? { ...w, ...edit } : w) } };
}
