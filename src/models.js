import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FLOOR_STYLES, WORLD_BLOCKS } from './game.js';
import { createBlenderFurniture } from './model-assets.js';
import { allWalls, floorRegions, HOUSE_FLOOR, HOUSE_WINDOW as WINDOW, WALL_HEIGHT, wallAxis, wallOpenings, wallParts } from './architecture.js';
import { createResidentModel } from './characters.js';
import { createTelevision } from './activity-props.js';

const geometries = new Map(), materials = new Map();
const geometry = (key, create) => {
  if (!geometries.has(key)) geometries.set(key, create());
  return geometries.get(key);
};
export function material(color, options = {}) {
  const key = color + JSON.stringify(options);
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options }));
  return materials.get(key);
}
function add(group, geo, color, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(geo, material(color, options));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
export function box(g, x, y, z, w, h, d, color, radius = 0) {
  const key = radius ? `r${w},${h},${d},${radius}` : 'box';
  const geo = geometry(key, () => radius ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(1, 1, 1));
  const m = add(g, geo, color, x, y, z);
  if (!radius) m.scale.set(w, h, d);
  return m;
}
export function sphere(g, x, y, z, sx, sy, sz, color, faceted = false) {
  const geo = geometry(faceted ? 'ico' : 'sphere', () => faceted ? new THREE.IcosahedronGeometry(1, 1) : new THREE.SphereGeometry(1, 24, 16));
  const m = add(g, geo, color, x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
export function cylinder(g, x, y, z, r1, r2, height, color, segments = 20) {
  const geo = geometry(`c${r1},${r2},${height},${segments}`, () => new THREE.CylinderGeometry(r1, r2, height, segments));
  return add(g, geo, color, x, y, z);
}
function legs(g, w, d, top, color = '#96754f') {
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) {
    box(g, x, top / 2, z, 0.09, top, 0.09, color, 0.025);
  }
}
function book(g, x, y, z, color, height = 0.3, width = 0.09) {
  box(g, x, y + height / 2, z, width, height, 0.21, color, 0.012);
  box(g, x, y + height * 0.22, z + 0.111, width * 0.75, 0.015, 0.008, '#e7e0cc');
}
function littlePlant(g, x, y, z, size = 1, pot = '#e6d7bd') {
  const p = new THREE.Group();
  cylinder(p, 0, 0.14, 0, 0.15, 0.115, 0.28, pot);
  cylinder(p, 0, 0.282, 0, 0.125, 0.125, 0.014, '#594638');
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const leaf = sphere(p, Math.sin(a) * 0.11, 0.39 + (i % 2) * 0.08, Math.cos(a) * 0.11, 0.075, 0.2, 0.045, i % 2 ? '#658553' : '#859c65');
    leaf.rotation.set(Math.cos(a) * 0.5, -a, -Math.sin(a) * 0.5);
  }
  p.position.set(x, y, z);
  p.scale.setScalar(size);
  g.add(p);
}
function vase(g, x, y, z) {
  sphere(g, x, y + 0.13, z, 0.12, 0.15, 0.12, '#cfb286');
  cylinder(g, x, y + 0.28, z, 0.045, 0.07, 0.12, '#cfb286');
  for (let i = 0; i < 3; i++) {
    const stem = cylinder(g, x + i * 0.035, y + 0.47, z, 0.009, 0.009, 0.36, '#798259', 5);
    stem.rotation.z = -i * 0.15;
    sphere(g, x + i * 0.07, y + 0.65 + (i % 2) * 0.06, z, 0.08, 0.11, 0.055, '#dfc69f', true);
  }
}

export function furnitureModel(type, color) {
  const imported = createBlenderFurniture(type, color);
  if (imported) return imported;
  const g = new THREE.Group();
  const dark = '#6d6250', white = '#f4eee0', wood = '#bf9c73';
  if (type === 'sofa' || type === 'chair') {
    const width = type === 'sofa' ? 3 : 1.15, inner = width - 0.32;
    legs(g, width - 0.4, 0.8, 0.23, dark);
    box(g, 0, 0.36, 0, width, 0.32, 1.03, color, 0.1);
    box(g, 0, 0.82, -0.4, inner, 0.71, 0.25, color, 0.11);
    for (const side of [-1, 1]) box(g, side * (width / 2 - 0.09), 0.66, 0, 0.22, 0.46, 1.1, color, 0.09);
    const seats = type === 'sofa' ? 3 : 1;
    for (let i = 0; i < seats; i++) {
      const x = (i - (seats - 1) / 2) * inner / seats;
      box(g, x, 0.57, 0.06, inner / seats - 0.03, 0.2, 0.82, color, 0.08);
      const cushion = box(g, x, 0.89, -0.245, inner / seats - 0.05, 0.56, 0.18, color, 0.08);
      cushion.rotation.x = -0.13;
    }
    const pillow = box(g, -inner * 0.3, 0.81, 0.12, 0.43, 0.44, 0.2, '#e4d6b6', 0.085);
    pillow.rotation.set(0.08, 0.1, -0.18);
    if (type === 'sofa') {
      const p2 = box(g, inner * 0.34, 0.81, 0.12, 0.42, 0.4, 0.21, '#c09c75', 0.08);
      p2.rotation.z = 0.18;
      box(g, 0.4, 0.69, 0.28, 0.55, 0.04, 0.57, '#d7c9a9', 0.02);
      box(g, 0.4, 0.48, 0.58, 0.55, 0.4, 0.025, '#d7c9a9');
    }
  } else if (type === 'coffee') {
    cylinder(g, -0.45, 0.25, 0, 0.13, 0.17, 0.5, dark);
    cylinder(g, 0.45, 0.25, 0, 0.13, 0.17, 0.5, dark);
    box(g, 0, 0.51, 0, 1.55, 0.12, 0.85, color, 0.15);
    box(g, -0.28, 0.6, 0.03, 0.4, 0.06, 0.3, '#718b7e');
    box(g, -0.24, 0.645, 0.03, 0.4, 0.035, 0.3, '#eee2c7');
    cylinder(g, 0.36, 0.66, 0.02, 0.085, 0.075, 0.19, '#efe9d9');
    cylinder(g, 0.36, 0.76, 0.02, 0.065, 0.065, 0.005, '#634b3b');
    vase(g, 0.02, 0.57, -0.18);
  } else if (type === 'shelf') {
    box(g, 0, 1.13, -0.22, 1.45, 2.15, 0.05, color);
    for (const x of [-0.69, 0, 0.69]) box(g, x, 1.1, 0, 0.07, 2.2, 0.5, color);
    for (let i = 0; i < 4; i++) box(g, 0, 0.12 + i * 0.68, 0, 1.45, 0.07, 0.5, color);
    for (let i = 0; i < 4; i++) book(g, -0.53 + i * 0.11, 0.83, 0.07, ['#b99c79', '#81998c', '#bd8d78', '#e4d4b8'][i], 0.34 + (i % 2) * 0.09);
    for (let i = 0; i < 4; i++) book(g, 0.2 + i * 0.09, 0.15, 0.07, ['#779190', '#d4c299', '#e2c3a6', '#bca086'][i], 0.34);
    box(g, -0.34, 0.3, 0.02, 0.47, 0.26, 0.36, '#d4c3a2', 0.03);
    littlePlant(g, 0.34, 1.51, 0, 0.8);
    vase(g, -0.35, 1.5, 0);
    box(g, 0.35, 0.89, 0.05, 0.45, 0.1, 0.33, '#e5d4b2');
  } else if (type === 'plant') {
    cylinder(g, 0, 0.23, 0, 0.25, 0.2, 0.46, color);
    cylinder(g, 0, 0.46, 0, 0.23, 0.23, 0.015, '#584d37');
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4;
      const h = 0.7 + (i % 3) * 0.25;
      const stem = cylinder(g, Math.sin(a) * 0.12, h / 2 + 0.23, Math.cos(a) * 0.12, 0.015, 0.019, h, '#647b42', 6);
      stem.rotation.z = Math.sin(a) * 0.2;
      const leaf = sphere(g, Math.sin(a) * 0.28, h + 0.32, Math.cos(a) * 0.28, 0.2, 0.31, 0.07, ['#648346', '#8a9e65', '#4b723f'][i % 3]);
      leaf.rotation.set(0.2, a, Math.sin(a) * 0.7);
    }
  } else if (type === 'lamp') {
    cylinder(g, 0, 0.045, 0, 0.23, 0.27, 0.09, '#b6a178');
    cylinder(g, 0, 0.85, 0, 0.027, 0.027, 1.65, '#a78e58');
    cylinder(g, 0, 1.65, 0, 0.23, 0.37, 0.43, color, 32);
    cylinder(g, 0, 1.44, 0, 0.33, 0.33, 0.015, '#f9edc8');
    sphere(g, 0, 1.85, 0, 0.04, 0.06, 0.04, '#a78e58');
  } else if (type === 'rug') {
    box(g, 0, 0.021, 0, 3.8, 0.04, 3.2, color, 0.035);
    for (let i = -7; i <= 7; i++) {
      box(g, i * 0.24, 0.043, 0, 0.012, 0.003, 3.05, '#ddcfb4');
    }
    for (const z of [-1.37, 1.37]) {
      box(g, 0, 0.046, z, 3.5, 0.006, 0.035, '#a69f82');
      box(g, 0, 0.046, z * 0.87, 3.5, 0.006, 0.025, '#b4b295');
    }
    for (let i = -10; i <= 10; i++) for (const z of [-1.64, 1.64]) box(g, i * 0.17, 0.025, z, 0.035, 0.012, 0.1, '#ded2b9');
  } else if (type === 'tv') {
    legs(g, 1.8, 0.35, 0.16);
    box(g, 0, 0.43, 0, 2.1, 0.55, 0.55, color, 0.035);
    for (const x of [-0.67, 0, 0.67]) {
      box(g, x, 0.43, 0.283, 0.62, 0.43, 0.025, color, 0.02);
      box(g, x, 0.49, 0.307, 0.18, 0.025, 0.025, '#79684e');
    }
    box(g, -0.08, 1.24, -0.015, 1.7, 0.97, 0.08, '#3f4843', 0.03);
    box(g, -0.08, 0.77, 0, 0.42, 0.065, 0.24, '#39463f');
    const television = createTelevision();
    g.add(television.mesh);
    g.userData.screenPlayback = television;
  } else if (type === 'bed') {
    legs(g, 1.8, 2.4, 0.2);
    box(g, 0, 0.36, 0, 2.25, 0.35, 2.9, wood, 0.08);
    box(g, 0, 0.65, -1.32, 2.25, 1.08, 0.17, color, 0.07);
    box(g, 0, 0.59, 0, 2.12, 0.25, 2.68, '#f3eddc', 0.11);
    box(g, 0, 0.76, 0.35, 2.16, 0.23, 1.96, color, 0.09);
    box(g, 0, 0.905, -0.45, 2.15, 0.045, 0.24, '#e4dec9', 0.02);
    box(g, 0, 0.9, 0.88, 2.15, 0.04, 0.5, '#ded3b7', 0.03);
    for (const x of [-0.52, 0.52]) box(g, x, 0.82, -0.95, 0.85, 0.21, 0.49, '#f6efde', 0.1);
  } else if (type === 'nightstand') {
    legs(g, 0.43, 0.4, 0.15);
    box(g, 0, 0.37, 0, 0.65, 0.47, 0.6, color, 0.04);
    for (const y of [0.27, 0.47]) {
      box(g, 0, y, 0.306, 0.56, 0.17, 0.018, color, 0.01);
      sphere(g, 0, y, 0.333, 0.03, 0.025, 0.025, '#8a714f');
    }
    cylinder(g, 0, 0.73, 0, 0.1, 0.1, 0.26, '#d5ba8f');
    cylinder(g, 0, 0.95, 0, 0.12, 0.2, 0.23, '#f0dfb9');
  } else if (type === 'desk') {
    legs(g, 1.55, 0.62, 0.83);
    box(g, 0, 0.86, -0.3, 1.8, 0.11, 0.8, color, 0.05);
    box(g, -0.1, 1.16, -0.48, 0.67, 0.43, 0.045, '#6d807b', 0.02);
    box(g, -0.1, 0.934, -0.25, 0.67, 0.03, 0.43, '#b9c4ba', 0.02);
    littlePlant(g, 0.6, 0.93, -0.43, 0.65);
    const chair = furnitureModel('chair', '#9eae96');
    chair.scale.setScalar(0.68);
    chair.rotation.y = Math.PI;
    chair.position.z = 0.49;
    g.add(chair);
  } else if (type === 'kitchen') {
    box(g, 0, 0.49, 0, 3.9, 0.89, 0.89, color, 0.03);
    box(g, 0, 0.96, 0, 4, 0.11, 0.98, '#ece6d7', 0.025);
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 0.64;
      box(g, x, 0.51, 0.455, 0.6, 0.76, 0.022, color, 0.015);
      box(g, x, 0.75, 0.481, 0.21, 0.025, 0.035, '#ad956c', 0.009);
    }
    box(g, -1.13, 1.024, 0, 0.75, 0.014, 0.62, '#7e8e86', 0.075);
    box(g, -1.13, 1.035, 0, 0.59, 0.01, 0.47, '#a8b5ad', 0.065);
    cylinder(g, -1.13, 1.2, -0.34, 0.025, 0.025, 0.35, '#c3b798');
    const tap = cylinder(g, -1.13, 1.35, -0.25, 0.026, 0.026, 0.21, '#c3b798');
    tap.rotation.x = Math.PI / 2;
    box(g, 0.53, 1.024, 0, 1, 0.025, 0.64, '#46524b', 0.02);
    for (const x of [0.28, 0.78]) for (const z of [-0.16, 0.16]) cylinder(g, x, 1.044, z, 0.11, 0.11, 0.008, '#809087');
    cylinder(g, 0.78, 1.15, 0.16, 0.14, 0.14, 0.22, '#c6b48f');
    littlePlant(g, 1.62, 1.025, -0.1, 0.75);
  } else if (type === 'dining') {
    legs(g, 1.48, 0.7, 0.79);
    box(g, 0, 0.83, 0, 1.9, 0.11, 1.05, color, 0.12);
    for (const z of [-0.76, 0.76]) {
      const chair = new THREE.Group();
      legs(chair, 0.44, 0.4, 0.5);
      box(chair, 0, 0.52, 0, 0.59, 0.1, 0.54, '#eee1bf', 0.08);
      box(chair, 0, 0.86, -0.22, 0.57, 0.59, 0.07, color, 0.05);
      chair.position.z = z;
      if (z > 0) chair.rotation.y = Math.PI;
      g.add(chair);
    }
    const decor = new THREE.Group();
    decor.name = 'DiningDecor';
    vase(decor, 0, 0.89, 0);
    for (const x of [-0.6, 0.6]) cylinder(decor, x, 0.895, 0, 0.19, 0.19, 0.018, '#f3ebd9');
    g.add(decor);
  } else if (type === 'fridge') {
    box(g, 0, 0.99, 0, 0.9, 1.98, 0.85, color, 0.09);
    box(g, 0, 1.55, 0.44, 0.86, 0.7, 0.075, color, 0.045);
    box(g, 0, 0.59, 0.44, 0.86, 1.11, 0.075, color, 0.045);
    box(g, -0.3, 1.55, 0.51, 0.045, 0.28, 0.065, '#b4b4a2', 0.02);
    box(g, -0.3, 0.91, 0.51, 0.045, 0.29, 0.065, '#b4b4a2', 0.02);
  } else if (type === 'toilet') {
    box(g, 0, 0.18, 0, 0.42, 0.36, 0.69, color, 0.12);
    sphere(g, 0, 0.42, 0.1, 0.36, 0.19, 0.43, color);
    const basin = cylinder(g, 0, 0.565, 0.12, 0.235, 0.22, 0.015, '#788f96', 32);
    basin.scale.z = 1.28; basin.name = 'ToiletWater';
    const ring = new THREE.Mesh(geometry('toilet-seat', () => new THREE.TorusGeometry(0.285, 0.05, 10, 40)), material('#f7faf7', { roughness: 0.25 }));
    ring.rotation.x = -Math.PI / 2; ring.scale.y = 1.32; ring.position.set(0, 0.59, 0.12); g.add(ring);
    box(g, 0, 0.69, -0.39, 0.65, 0.83, 0.29, color, 0.06);
    box(g, 0, 1.12, -0.39, 0.69, 0.06, 0.32, '#f7faf7', 0.03);
    cylinder(g, 0.16, 1.156, -0.39, 0.045, 0.045, 0.012, '#a4b4b8');
  } else if (type === 'shower') {
    box(g, 0, 0.06, 0, 1.4, 0.12, 1.4, '#edf2ed', 0.06);
    box(g, 0, 0.125, 0, 1.17, 0.025, 1.17, '#c4d3d1', 0.035);
    cylinder(g, 0, 0.142, -0.15, 0.065, 0.065, 0.01, '#87999d');
    const glass = material(color, { transparent: true, opacity: 0.38, roughness: 0.72, depthWrite: false, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const panel = box(g, side * 0.65, 1.17, 0, 0.045, 2.1, 1.34, color);
      panel.material = glass;
      box(g, side * 0.65, 1.17, -0.65, 0.055, 2.12, 0.055, '#8faaa9');
      box(g, side * 0.65, 1.17, 0.65, 0.055, 2.12, 0.055, '#8faaa9');
    }
    box(g, 0, 1.17, -0.65, 1.34, 2.1, 0.06, color);
    cylinder(g, 0, 1.45, -0.57, 0.025, 0.025, 1.3, '#a7b6b9');
    box(g, 0, 2.12, -0.34, 0.045, 0.045, 0.5, '#a7b6b9');
    cylinder(g, 0, 2.1, -0.09, 0.19, 0.2, 0.05, '#859ea4');
    box(g, 0, 1.03, -0.56, 0.22, 0.07, 0.08, '#a7b6b9', 0.025);
  } else if (type === 'bench') {
    legs(g, 1.55, 0.46, 0.54, '#66776a');
    for (let i = 0; i < 4; i++) box(g, 0, 0.56, (i - 1.5) * 0.15, 1.9, 0.08, 0.12, color, 0.025);
    for (let i = 0; i < 3; i++) box(g, 0, 0.77 + i * 0.15, -0.28, 1.9, 0.12, 0.07, color, 0.02);
    for (const x of [-0.77, 0.77]) box(g, x, 0.79, -0.28, 0.07, 0.6, 0.07, '#66776a');
  } else if (type === 'planter') {
    box(g, 0, 0.25, 0, 1.4, 0.5, 0.7, color, 0.04);
    box(g, 0, 0.507, 0, 1.22, 0.02, 0.52, '#766247', 0.01);
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.23;
      littlePlant(g, x, 0.38, 0, 0.8, color);
      sphere(g, x, 0.91 + (i % 2) * 0.1, 0, 0.1, 0.07, 0.1, i % 2 ? '#f5d5ab' : '#d38e83');
    }
  }
  g.userData.type = type;
  return g;
}

export function avatarModel(avatar) {
  const resident = createResidentModel(avatar);
  if (resident) return resident;
  const g = new THREE.Group();
  const legsGroup = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0.87, 0);
    box(leg, 0, -0.31, 0, 0.23, 0.67, 0.27, avatar.pants, 0.07);
    box(leg, 0, -0.69, 0.055, 0.245, 0.17, 0.4, avatar.shoes, 0.06);
    box(leg, 0, -0.771, 0.065, 0.25, 0.025, 0.39, '#dddace', 0.01);
    g.add(leg); legsGroup.push(leg);
  }
  const torso = box(g, 0, 1.14, 0, 0.58 * avatar.build, 0.67, 0.37, avatar.top, 0.13);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.32 * avatar.build, 1.37, 0);
    arm.rotation.z = side * 0.1;
    box(arm, side * 0.045, -0.14, 0, 0.22, 0.34, 0.29, avatar.top, 0.085);
    box(arm, side * 0.06, -0.43, 0, 0.15, 0.32, 0.18, avatar.skin, 0.065);
    sphere(arm, side * 0.06, -0.62, 0.012, 0.095, 0.11, 0.095, avatar.skin);
    g.add(arm); arms.push(arm);
  }
  cylinder(g, 0, 1.51, 0, 0.12, 0.13, 0.2, avatar.skin);
  const head = new THREE.Group();
  head.position.y = 1.84;
  head.scale.x = avatar.face;
  sphere(head, 0, 0, 0, 0.33, 0.39, 0.3, avatar.skin);
  for (const side of [-1, 1]) {
    sphere(head, side * 0.325, -0.025, 0, 0.071, 0.095, 0.073, avatar.skin);
    sphere(head, side * 0.123, 0.015, 0.279, 0.037 * avatar.eyes, 0.047 * avatar.eyes, 0.019, '#3b3933');
    sphere(head, side * 0.13 - 0.009, 0.03, 0.294, 0.009, 0.012, 0.005, '#fff8e8');
    const brow = box(head, side * 0.124, 0.105, 0.268, 0.087, 0.021, 0.025, avatar.hairColor, 0.009);
    brow.rotation.z = side * 0.09;
    sphere(head, side * 0.2, -0.088, 0.25, 0.07, 0.035, 0.006, '#dba58e');
  }
  sphere(head, 0, -0.055, 0.307, 0.045 * avatar.nose, 0.055 * avatar.nose, 0.054 * avatar.nose, avatar.skin);
  const smile = new THREE.Mesh(geometry('smile', () => new THREE.TorusGeometry(0.065, 0.009, 6, 20, Math.PI * 0.7)), material('#986a5a'));
  smile.position.set(0.022, -0.138, 0.278);
  smile.rotation.z = Math.PI * 1.16;
  head.add(smile);
  const hair = avatar.hairColor;
  sphere(head, 0, 0.2, -0.05, 0.347, 0.255, 0.31, hair);
  if (avatar.hair === 'bob') {
    for (const side of [-1, 1]) sphere(head, side * 0.29, -0.03, -0.04, 0.105, 0.36, 0.25, hair);
    sphere(head, 0, 0.005, -0.25, 0.29, 0.34, 0.12, hair);
    const fringe = sphere(head, -0.11, 0.207, 0.225, 0.215, 0.14, 0.09, hair);
    fringe.rotation.z = -0.32;
    sphere(head, 0.23, 0.17, 0.2, 0.11, 0.16, 0.09, hair);
  } else if (avatar.hair === 'short') {
    for (let i = 0; i < 5; i++) {
      const s = sphere(head, (i - 2) * 0.095, 0.28 + (i % 2) * 0.035, 0.18, 0.13, 0.13, 0.13, hair);
      s.rotation.z = -0.3;
    }
  } else if (avatar.hair === 'bun') {
    sphere(head, 0, 0.41, -0.12, 0.18, 0.18, 0.18, hair);
    cylinder(head, 0, 0.305, -0.12, 0.11, 0.11, 0.025, '#bba97e');
    sphere(head, -0.17, 0.17, 0.2, 0.19, 0.13, 0.1, hair);
    for (const s of [-1, 1]) sphere(head, s * 0.29, 0.07, -0.06, 0.06, 0.23, 0.19, hair);
  } else {
    for (let i = 0; i < 20; i++) {
      const a = i * 2.4, y = i < 12 ? 0.23 : 0.05;
      sphere(head, Math.sin(a) * 0.29, y + (i % 3) * 0.035, Math.cos(a) * 0.22 - 0.035, 0.13, 0.14, 0.13, hair);
    }
  }
  if (avatar.glasses) {
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(geometry('glasses', () => new THREE.TorusGeometry(0.089, 0.011, 6, 24)), material('#77715d'));
      ring.position.set(s * 0.126, 0.021, 0.31);
      head.add(ring);
    }
    box(head, 0, 0.043, 0.32, 0.074, 0.012, 0.013, '#77715d');
  }
  g.add(head);
  g.scale.setScalar(avatar.height);
  g.userData = { legs: legsGroup, arms, torso, head };
  return g;
}

function windowPanel(g, x, z, width, horizontal = true, elevation = 0) {
  const frame = new THREE.Group();
  frame.name = 'HouseWindow';
  frame.userData.window = { bottom: elevation + WINDOW.bottom, top: elevation + WINDOW.top, width };
  const glass = box(frame, 0, WINDOW.center, 0, width - WINDOW.frame, WINDOW.height - WINDOW.frame, 0.035, '#c7e2dd');
  glass.name = 'WindowGlass';
  glass.material = material('#c7e2dd', { transparent: true, opacity: 0.4, roughness: 0.15 });
  for (const offset of [-width / 2, 0, width / 2]) box(frame, offset, WINDOW.center, 0.045, WINDOW.frame, WINDOW.height + WINDOW.frame, 0.11, '#efeddf');
  for (const y of [WINDOW.bottom, WINDOW.center, WINDOW.top]) box(frame, 0, y, 0.045, width + WINDOW.frame, WINDOW.frame, 0.11, '#efeddf');
  box(frame, 0, WINDOW.bottom - 0.035, 0.06, width + 0.28, 0.12, 0.31, '#d7c6a5', 0.02);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    cylinder(frame, side * (width / 2 - 0.06) + (i - 1) * 0.045, WINDOW.center, 0.2, 0.05, 0.05, WINDOW.height - 0.07, '#e9e5d2', 10);
  }
  frame.position.set(x, elevation, z);
  if (!horizontal) frame.rotation.y = Math.PI / 2;
  g.add(frame);
}

export function houseModel(home, roof = false) {
  const g = new THREE.Group();
  g.userData.wallGroups = [];
  g.userData.floorSurfaces = [];
  const floorColor = FLOOR_STYLES.find(s => s.id === home.floor).color;
  for (const region of floorRegions(home)) {
    const w = region.x2 - region.x1, d = region.z2 - region.z1;
    const x = (region.x1 + region.x2) / 2, z = (region.z1 + region.z2) / 2;
    const foundation = box(g, x, 0.07, z, w + 0.18, 0.3, d + 0.18, '#d6ceb8');
    foundation.userData.floorId = region.id;
    const cols = Math.ceil(w / 0.55), rows = Math.ceil(d / 1.5);
    for (let ix = 0; ix < cols; ix++) for (let iz = 0; iz < rows; iz++) {
      const col = new THREE.Color(region.id === 'bathroom' ? '#b8c7c6' : floorColor);
      col.multiplyScalar(0.965 + ((ix * 7 + iz * 3) % 6) * 0.014);
      const tw = w / cols, td = d / rows;
      if (home.floor === 'tile' && (ix + iz) % 2) col.set('#e2e3d4');
      const tile = box(g, region.x1 + tw * (ix + 0.5), 0.225, region.z1 + td * (iz + 0.5), tw - 0.014, 0.05, td - 0.014, `#${col.getHexString()}`);
      tile.userData.floorId = region.id;
      g.userData.floorSurfaces.push(tile);
    }
    if (roof) {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 - 0.3, 0); shape.lineTo(0, Math.min(2.2, w * 0.22)); shape.lineTo(w / 2 + 0.3, 0); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false });
      const mesh = add(g, geo, '#bb8169', x, HOUSE_FLOOR + WALL_HEIGHT, region.z1 - 0.3);
      mesh.userData.disposable = true;
    }
  }
  for (const wall of allWalls(home)) {
    const full = new THREE.Group(), low = new THREE.Group(), axis = wallAxis(wall);
    for (const part of wallParts(wall)) {
      box(full, part.x, HOUSE_FLOOR + (part.bottom + part.top) / 2, part.z, part.width, part.top - part.bottom, part.depth, home.wallColor);
    }
    for (const part of wallParts(wall, true)) {
      box(low, part.x, HOUSE_FLOOR + 0.12, part.z, part.width, 0.24, part.depth, home.wallColor);
      box(low, part.x, HOUSE_FLOOR + 0.26, part.z, part.width + 0.02, 0.04, part.depth + 0.02, '#edf0e8');
    }
    for (const opening of wallOpenings(wall)) {
      const x = axis.horizontal ? opening.position : axis.fixed;
      const z = axis.horizontal ? axis.fixed : opening.position;
      if (opening.kind === 'window') windowPanel(full, x, z, opening.width, axis.horizontal, HOUSE_FLOOR);
      else {
        const frame = new THREE.Group();
        frame.position.set(x, HOUSE_FLOOR, z);
        frame.rotation.y = axis.horizontal ? 0 : Math.PI / 2;
        for (const side of [-1, 1]) box(frame, side * (opening.width / 2 + 0.025), 1.23, 0, 0.08, 2.46, 0.23, '#eef0e8');
        box(frame, 0, 2.47, 0, opening.width + 0.16, 0.1, 0.23, '#eef0e8');
        full.add(frame);
      }
    }
    for (const group of [full, low]) group.traverse(node => { node.userData.wallId = wall.id; });
    low.visible = false;
    g.add(full, low);
    g.userData.wallGroups.push({ full, low, wall });
  }
  if (home.foundation !== false) {
    box(g, 0, 0.08, home.depth / 2 + 0.46, 1.8, 0.17, 0.75, '#d9d0b6');
    const patioWidth = Math.min(3.25, 10.35 - home.width / 2);
    const patioX = home.width / 2 + patioWidth / 2 + 0.075;
    box(g, patioX, 0.055, 0.5, patioWidth, 0.09, 6.3, '#c6af86');
    for (let i = 0; i < 12; i++) box(g, patioX, 0.105, -2.42 + i * 0.51, patioWidth, 0.008, 0.025, '#ae936f');
  }
  return g;
}

function tree(g, x, z, size = 1, variant = 0) {
  const t = new THREE.Group();
  cylinder(t, 0, 1.15, 0, 0.14, 0.25, 2.3, '#8f8060', 7);
  const colors = variant ? ['#92aa74', '#a5b783', '#849f6a'] : ['#799964', '#8fab76', '#6f905c'];
  sphere(t, 0, 2.9, 0, 1.13, 1.2, 1.06, colors[0], true);
  sphere(t, -0.71, 2.35, 0.22, 0.87, 0.88, 0.83, colors[1], true);
  sphere(t, 0.67, 2.53, -0.3, 0.87, 0.96, 0.84, colors[2], true);
  sphere(t, 0.25, 3.45, 0.13, 0.73, 0.79, 0.71, colors[1], true);
  cylinder(t, 0, 0.012, 0, 1.05, 1.05, 0.025, '#93b17e', 24);
  t.position.set(x, 0, z); t.scale.setScalar(size); g.add(t);
}

function cottage(g, x, z, width, depth, color, roofColor) {
  const h = new THREE.Group();
  box(h, 0, 1.8, 0, width, 3.6, depth, color);
  box(h, 0, 0.14, 0, width + 0.25, 0.28, depth + 0.25, '#d5ccb8');
  const angle = Math.atan2(2.2, width / 2 + 0.5), slant = Math.hypot(2.2, width / 2 + 0.5);
  for (const side of [-1, 1]) {
    const roof = box(h, side * (width / 4 + 0.25), 4.67, 0, slant, 0.22, depth + 1, roofColor);
    roof.rotation.z = -side * angle;
    for (let i = 0; i < 7; i++) {
      const line = box(h, side * (width / 4 + 0.25), 4.82, -depth / 2 + i * depth / 6, slant, 0.035, 0.028, roofColor);
      line.rotation.z = -side * angle;
    }
  }
  const triangle = new THREE.Shape();
  triangle.moveTo(-width / 2, 0); triangle.lineTo(0, 2); triangle.lineTo(width / 2, 0); triangle.closePath();
  const face = new THREE.Mesh(new THREE.ShapeGeometry(triangle), material(color, { side: THREE.DoubleSide }));
  face.position.set(0, 3.6, depth / 2 + 0.02); h.add(face);
  box(h, width / 4, 5, -depth / 5, 0.7, 1.9, 0.8, '#d6b39c');
  box(h, width / 4, 6, -depth / 5, 0.9, 0.2, 1, '#ece2ce');
  box(h, 0, 1.25, depth / 2 + 0.04, 1.35, 2.5, 0.13, '#769888', 0.035);
  box(h, 0, 1.55, depth / 2 + 0.12, 0.92, 1.2, 0.025, '#c5d9d2');
  for (const side of [-1, 1]) {
    windowPanel(h, side * width * 0.32, depth / 2 + 0.06, 1.5);
    box(h, side * width * 0.32, 0.68, depth / 2 + 0.28, 1.8, 0.3, 0.4, '#b48f6c', 0.03);
    for (let i = 0; i < 4; i++) sphere(h, side * width * 0.32 + (i - 1.5) * 0.36, 0.94, depth / 2 + 0.28, 0.22, 0.17, 0.24, i % 2 ? '#e5bb9d' : '#8da36f', true);
  }
  h.position.set(x, 0, z); g.add(h);
}

export function neighborhoodModel() {
  const g = new THREE.Group();
  box(g, 0, -0.18, 0, 160, 0.3, 160, '#a8bd8b');
  box(g, 0, -0.017, 0, 22, 0.025, 18, '#b6c695');
  for (const z of [-11, 11, 35]) {
    box(g, 0, -0.005, z, 95, 0.03, 4.3, '#c5c8bb');
    for (const side of [-1, 1]) {
      box(g, 0, 0.029, z + side * 2.6, 95, 0.1, 0.9, '#dedbc9');
      box(g, 0, 0.06, z + side * 2.16, 95, 0.07, 0.11, '#eee8d7');
    }
    for (let x = -44; x < 44; x += 3) box(g, x, 0.017, z, 1.2, 0.008, 0.075, '#e8e4d2');
  }
  for (const x of [-13, 13]) {
    box(g, x, 0.001, 0, 3.1, 0.025, 95, '#c5c8bb');
    for (const side of [-1, 1]) box(g, x + side * 1.94, 0.02, 0, 0.75, 0.08, 95, '#dedbc9');
  }
  for (let i = 0; i < 6; i++) box(g, 0, 0.039, 5.25 + i * 0.72, 1.4, 0.06, 0.52, '#e1ddc9', 0.03);
  for (const x of [-10.7, 10.7]) {
    for (let z = -8.5; z < 8.5; z += 0.5) {
      box(g, x, 0.48, z, 0.1, 0.91, 0.12, '#eee9d6', 0.025);
    }
    for (const y of [0.3, 0.68]) box(g, x, y, 0, 0.09, 0.09, 17, '#e8e4d1');
  }
  for (const side of [-1, 1]) for (let x = 1.8; x < 10.8; x += 0.5) {
    box(g, side * x, 0.48, 8.5, 0.12, 0.91, 0.1, '#eee9d6', 0.025);
  }
  for (const side of [-1, 1]) for (const y of [0.3, 0.68]) box(g, side * 6.25, y, 8.5, 9, 0.09, 0.09, '#e8e4d1');
  cylinder(g, 1.75, 0.64, 8.3, 0.065, 0.065, 1.28, '#82917a');
  box(g, 1.75, 1.3, 8.3, 0.52, 0.38, 0.6, '#7c9b8d', 0.065);
  box(g, 1.75, 1.31, 8.61, 0.25, 0.04, 0.015, '#e6ddbd');
  const trees = [
    [-8.7, -6.7, 1.3], [8.4, -6.7, 1.25], [-8.3, 4.9, 0.9], [9, 6, 1.05],
    [-17, 7, 1.3], [-18, -5, 1.15], [18, -6, 1.2], [22, 6, 1.4], [27, -5, 1.3],
    [-27, -8, 1.4], [-25, 10, 1.5], [28, -20, 1.3], [-8, -17, 1.35], [9, -22, 1.3],
    [-27, -20, 1.3], [-8, 19, 1.2], [3, 18, 1.2], [15, 22, 1.4], [29, 23, 1.7],
    [-28, 22, 1.7], [-3, -29, 1.5], [15, -28, 1.5], [-18, -29, 1.7], [32, 3, 1.6],
  ];
  trees.forEach(([x, z, s], i) => tree(g, x, z, s, i % 2));
  for (let i = 0; i < 32; i++) {
    const x = Math.sin(i * 19.2) * 34, z = Math.cos(i * 12.7) * 32;
    if (Math.abs(x) < 16 && Math.abs(z) < 14) continue;
    for (let j = 0; j < 3; j++) sphere(g, x + j * 0.38, 0.3, z, 0.46, 0.38, 0.4, j % 2 ? '#90a773' : '#9bb17e', true);
  }
  for (let i = 0; i < 52; i++) {
    const x = Math.sin(i * 13.7) * 9.7, z = Math.cos(i * 5.3) * 7.9;
    if (Math.abs(x) < 6.8 && Math.abs(z) < 5.3 || Math.abs(x) < 2 || x > 6 && Math.abs(z) < 3.5) continue;
    for (let j = 0; j < 3; j++) {
      const stem = cylinder(g, x + j * 0.07, 0.12, z, 0.012, 0.012, 0.23, '#79905e', 4);
      stem.castShadow = false;
      sphere(g, x + j * 0.07, 0.25, z, 0.052, 0.035, 0.052, i % 3 ? '#f1dfb4' : '#d7a593', true);
    }
  }
  WORLD_BLOCKS.forEach((b, i) => {
    if (i === 7) {
      const pond = cylinder(g, b.x, 0.03, b.z, 3.1, 3.1, 0.1, '#88b8b1', 48);
      pond.scale.z = 0.7;
      for (let j = 0; j < 12; j++) {
        const a = j / 12 * Math.PI * 2;
        sphere(g, b.x + Math.cos(a) * 3.15, 0.14, b.z + Math.sin(a) * 2.2, 0.45, 0.25, 0.35, '#c7c7af', true);
      }
      const b1 = furnitureModel('bench', '#be9971');
      b1.position.set(b.x - 4.7, 0.02, b.z); b1.rotation.y = Math.PI / 2; g.add(b1);
    } else cottage(g, b.x, b.z, b.width, b.depth, ['#e7e0c9', '#e7d2bd', '#c4cdb9'][i % 3], ['#b98873', '#9ba79b', '#c3a27d'][i % 3]);
  });
  for (const [x, z] of [[-10, 10], [10, -10], [16, 10], [-16, -10], [10, 33]]) {
    cylinder(g, x, 1.5, z, 0.045, 0.06, 3, '#687d6e');
    box(g, x, 3.1, z, 0.36, 0.48, 0.36, '#ebe4c7', 0.04);
    box(g, x, 3.38, z, 0.49, 0.09, 0.49, '#6b7a68', 0.03);
  }
  return g;
}

export function disposeModel(group) {
  group.traverse(obj => {
    obj.userData.screenPlayback?.dispose();
    if (obj.userData.disposable && obj.geometry) obj.geometry.dispose();
    if (obj.userData.ownMaterial && obj.material) obj.material.dispose();
    if (obj.isInstancedMesh) obj.dispose();
  });
}

export function batchStaticModel(group) {
  group.updateMatrixWorld(true);
  const batches = new Map();
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const key = `${mesh.geometry.uuid}:${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  });
  group.clear();
  for (const meshes of batches.values()) {
    const first = meshes[0];
    const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    meshes.forEach((mesh, i) => batch.setMatrixAt(i, mesh.matrixWorld));
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.computeBoundingSphere();
    group.add(batch);
  }
  return group;
}

let previewRenderer;
export function modelPreview(model, portrait = false) {
  if (!previewRenderer) {
    previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    previewRenderer.setSize(280, 210);
    previewRenderer.setPixelRatio(1);
    previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    previewRenderer.toneMappingExposure = 1.5;
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b3bba4', 2.4));
  const light = new THREE.DirectionalLight('#fff3da', 3);
  light.position.set(-3, 8, 5); scene.add(light);
  scene.add(model);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = portrait ? (model.userData.portraitExtent || 1.6) : Math.max(size.x, size.y * 1.4, size.z) * 1.12;
  const camera = new THREE.OrthographicCamera(-extent * 0.67, extent * 0.67, extent * 0.5, -extent * 0.5, 0.1, 100);
  const target = portrait ? new THREE.Vector3(...(model.userData.portraitTarget || [0, 1.57, 0])) : center;
  camera.position.copy(target).add(new THREE.Vector3(portrait ? 1 : 5, portrait ? 0.6 : 3.6, 6));
  camera.lookAt(target);
  previewRenderer.render(scene, camera);
  const url = previewRenderer.domElement.toDataURL('image/png');
  scene.remove(model);
  model.userData.controller?.dispose();
  model.userData.screenPlayback?.dispose();
  return url;
}
