import classifyPoint from 'robust-point-in-polygon';
import layout from './world-layout.json' with { type: 'json' };

export { layout };
export const LANDMARKS = layout.landmarks;
export const WORLD_COLLIDERS = [
  ...layout.buildings.map(b => ({ x: b.x, z: b.z, width: b.width, depth: b.depth })),
  ...layout.trees.map(([x, z, scale]) => ({ x, z, width: 0.48 * scale, depth: 0.48 * scale })),
  ...layout.rocks.map(([x, z, scale]) => ({ x, z, width: 1.15 * scale, depth: 1.05 * scale })),
  { x: -10.7, z: 0, width: 0.18, depth: 17 },
  { x: 10.7, z: 0, width: 0.18, depth: 17 },
  { x: -6.2, z: 8.5, width: 9, depth: 0.18 },
  { x: 6.2, z: 8.5, width: 9, depth: 0.18 },
];

export function bridgeCoordinates(bridge, x, z) {
  const dx = x - bridge.x, dz = z - bridge.z;
  const cos = Math.cos(bridge.rotation), sin = Math.sin(bridge.rotation);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

export function bridgeDeckHeight(bridge, z) {
  return bridge.height + 0.18 + 0.2 * Math.cos(z / bridge.depth * Math.PI);
}

export function terrainSurface(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { kind: 'water', height: layout.waterHeight };
  for (const bridge of layout.bridges) {
    const local = bridgeCoordinates(bridge, x, z);
    if (Math.abs(local.x) <= bridge.width / 2 - 0.14 && Math.abs(local.z) <= bridge.depth / 2) {
      return { kind: 'bridge', id: bridge.id, height: bridgeDeckHeight(bridge, local.z) };
    }
  }
  for (const ramp of layout.ramps) {
    if (Math.abs(x - ramp.x) <= ramp.width / 2 && Math.abs(z - ramp.z) <= ramp.depth / 2) {
      const t = (z - ramp.z + ramp.depth / 2) / ramp.depth;
      return { kind: 'ramp', id: ramp.id, height: ramp.from + (ramp.to - ramp.from) * t };
    }
  }
  for (const terrace of layout.terraces) {
    if (classifyPoint(terrace.polygon, [x, z]) <= 0) return { kind: 'terrace', id: terrace.id, height: terrace.height };
  }
  for (const land of layout.lands) {
    if (classifyPoint(land.polygon, [x, z]) <= 0) return { kind: 'land', id: land.id, height: land.height };
  }
  return { kind: 'water', height: layout.waterHeight };
}

export function terrainHeight(x, z) {
  return terrainSurface(x, z).height;
}

export function terrainWalkable(x, z) {
  const surface = terrainSurface(x, z);
  if (surface.kind === 'water' || surface.id === 'cliffs') return false;
  for (const [dx, dz] of [[0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]]) {
    const neighbor = terrainSurface(x + dx, z + dz);
    if (neighbor.kind !== 'water' && Math.abs(surface.height - neighbor.height) > 0.38) return false;
  }
  return true;
}

export function restoreWorldPosition(game) {
  if (terrainWalkable(game.sim.x, game.sim.z)) return game;
  return { ...game, sim: { ...game.sim, x: 0, z: 7 } };
}
