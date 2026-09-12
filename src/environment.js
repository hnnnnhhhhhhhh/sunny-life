import * as THREE from 'three';
import { batchStaticModel, box, cylinder, material, sphere } from './models.js';
import { createBlenderScenery } from './model-assets.js';
import { bridgeDeckHeight, layout, terrainHeight, terrainSurface } from './terrain.js';
import { createGrass, lowPolySurface } from './grass.js';
import { createOcean } from './ocean.js';

function shapeFor(polygon) {
  return new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
}

function landmass(parent, land, surfaces, base = -3.4) {
  const center = land.polygon.reduce((p, [x,z]) => p.add(new THREE.Vector2(x,z)), new THREE.Vector2()).multiplyScalar(1/land.polygon.length);
  const rings = base === -0.1 ? [[land.height-0.02,0], [base,0.25]] :
    [[land.height-0.02,0], [land.height-0.26,0.10], [layout.waterHeight+0.14,0.65], [layout.waterHeight-0.6,1.5], [base-0.8,3.4]];
  const points=[], indices=[], n=land.polygon.length;
  rings.forEach(([y, expansion], row) => land.polygon.forEach(([x,z], i) => {
    const outward=new THREE.Vector2(x-center.x,z-center.y).normalize();
    points.push(x+outward.x*expansion,y+(row>1?Math.sin(i*2.3)*0.09:0),z+outward.y*expansion);
  }));
  for (let row=0;row<rings.length-1;row++) for(let i=0;i<n;i++) {
    const a=row*n+i,b=row*n+(i+1)%n,c=(row+1)*n+i,d=(row+1)*n+(i+1)%n;
    indices.push(a,c,b,b,c,d);
  }
  let stoneGeometry = new THREE.BufferGeometry();
  stoneGeometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  stoneGeometry.setIndex(indices); stoneGeometry=stoneGeometry.toNonIndexed(); stoneGeometry.computeVertexNormals();
  const colors=[], normal=stoneGeometry.attributes.normal;
  for (let i=0;i<normal.count;i++) {
    const y=stoneGeometry.attributes.position.getY(i);
    const col=new THREE.Color(y>layout.waterHeight+0.1?'#c6c6b1':'#73aaa3');
    col.multiplyScalar(0.9+Math.abs(normal.getX(i))*0.08);
    colors.push(col.r,col.g,col.b);
  }
  stoneGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const earth = new THREE.Mesh(stoneGeometry, new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:0.94,side:THREE.DoubleSide}));
  earth.castShadow = true;
  earth.receiveShadow = false;
  earth.userData.disposable = earth.userData.ownMaterial = true;
  parent.add(earth);
  const grass = lowPolySurface(land.polygon, land.color, land.height);
  grass.userData.landId = land.id;
  parent.add(grass);
  surfaces.push(grass);
}

function rampMesh(ramp) {
  const { x, z, width: w, depth: d, from, to } = ramp;
  const points = [
    x - w / 2, from + 0.008, z - d / 2,
    x + w / 2, from + 0.008, z - d / 2,
    x - w / 2, to + 0.008, z + d / 2,
    x + w / 2, to + 0.008, z + d / 2,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material('#b8ad8f', { side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  mesh.userData.disposable = true;
  return mesh;
}

function bridgeSurface(bridge) {
  const points = [], indices = [];
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const z = -bridge.depth / 2 + i / segments * bridge.depth;
    const y = bridgeDeckHeight(bridge, z) - bridge.height;
    for (const x of [-bridge.width / 2, bridge.width / 2]) points.push(x, y, z);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  mesh.position.set(bridge.x, bridge.height, bridge.z);
  mesh.rotation.y = bridge.rotation;
  mesh.userData.disposable = true;
  mesh.userData.ownMaterial = true;
  return mesh;
}

function scenery(type, color) {
  const imported = createBlenderScenery(type, color);
  if (imported) return imported;
  const g = new THREE.Group();
  g.userData.source = 'procedural';
  if (type === 'pine' || type === 'oak') {
    cylinder(g, 0, 1.5, 0, 0.1, 0.17, 3, '#876c48', 7);
    if (type === 'pine') {
      for (let i = 0; i < 3; i++) cylinder(g, 0, 1.6 + i * 0.7, 0, 0, 1.1 - i * 0.2, 1.7, '#70904e', 9);
    } else sphere(g, 0, 2.8, 0, 1.3, 1.1, 1.25, '#99ad67', true);
  } else if (type === 'rock') {
    sphere(g, 0, 0.85, 0, 0.9, 0.85, 0.8, '#a5aaa2', true);
  } else if (type === 'tower') {
    cylinder(g, 0, 2.2, 0, 1.45, 1.4, 4.4, '#c1bdab', 12);
    cylinder(g, 0, 4.5, 0, 1.2, 2, 0.4, '#66617c', 12);
    cylinder(g, 0, 5.8, 0, 0, 1.25, 2.5, '#66617c', 12);
    box(g, 0, 3.5, 1.45, 0.7, 1, 0.05, '#f2cd77');
  } else if (type === 'townhouse') {
    box(g, 0, 2.5, 0, 4, 5, 3.2, color || '#ce8d78', 0.03);
    for (const x of [-1.2, 0, 1.2]) for (const y of [1, 3.4]) box(g, x, y, 1.63, 0.6, 1, 0.04, '#7b939a');
    box(g, 0, 5, 0, 4.2, 0.18, 3.4, '#e6d9bb');
  } else if (type === 'bridge') {
    box(g, 0, 0.22, 0, 2.8, 0.2, 8, '#ac8756');
  } else if (type === 'boat') {
    sphere(g, 0, 0.1, 0, 0.7, 0.28, 1.8, '#947047', true);
  } else if (type === 'tent') {
    const tent = cylinder(g, 0, 0.95, 0, 0, 1.7, 1.9, '#d6c29c', 4);
    tent.scale.z = 1.4;
  } else if (type === 'well') {
    cylinder(g, 0, 0.4, 0, 0.8, 0.8, 0.8, '#a5aa9b', 12);
  } else {
    box(g, 0, 0.23, 0, 0.6, 0.46, 2.5, '#90734b', 0.04);
  }
  return g;
}

function pathRibbon(parent, coordinates, width, pathSamples, color = '#b5b499') {
  const curve = new THREE.CatmullRomCurve3(coordinates.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const points = [], indices = [];
  const samples = 70;
  for (let i = 0; i <= samples; i++) {
    const p = curve.getPoint(i / samples);
    pathSamples.push({ x: p.x, z: p.z, radius: width / 2 + 0.3 });
    const tangent = curve.getTangent(i / samples);
    for (const side of [-1, 1]) {
      const x = p.x + tangent.z * width / 2 * side, z = p.z - tangent.x * width / 2 * side;
      points.push(x, terrainHeight(x, z) + 0.016, z);
    }
    if (i < samples) indices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material(color));
  mesh.receiveShadow = true;
  mesh.userData.disposable = true;
  parent.add(mesh);
}

function fence(g) {
  const wood = '#c3b18a', rail = '#b29a74';
  for (const x of [-10.7, 10.7]) {
    for (let z = -8.5; z <= 8.5; z += 1) {
      box(g, x, 0.45, z, 0.12, 0.9, 0.12, wood, 0.015);
    }
    for (const y of [0.28, 0.66]) box(g, x, y, 0, 0.085, 0.095, 17, rail);
  }
  for (const side of [-1, 1]) {
    for (let x = 1.7; x <= 10.7; x++) box(g, x * side, 0.45, 8.5, 0.12, 0.9, 0.12, wood, 0.015);
    for (const y of [0.28, 0.66]) box(g, side * 6.2, y, 8.5, 9, 0.095, 0.085, rail);
  }
  cylinder(g, 1.65, 0.62, 8.1, 0.055, 0.065, 1.24, '#8b7854', 7);
  box(g, 1.65, 1.28, 8.1, 0.46, 0.34, 0.54, '#749c91', 0.04);
  box(g, 1.65, 1.3, 8.38, 0.23, 0.025, 0.025, '#dccc99');
}

export function createEnvironment() {
  const root = new THREE.Group(), solid = new THREE.Group(), surfaces = [], assets = [];
  const ocean = createOcean(), water = ocean.mesh;
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(240,240),new THREE.MeshBasicMaterial({color:'#236779'}));
  seabed.rotation.x=-Math.PI/2; seabed.position.y=-5.8;
  seabed.userData.disposable=seabed.userData.ownMaterial=true; root.add(seabed);
  root.add(water);
  for (const land of layout.lands) landmass(root, land, surfaces);
  for (const terrace of layout.terraces) landmass(root, terrace, surfaces, -0.1);
  for (const ramp of layout.ramps) {
    const mesh = rampMesh(ramp);
    root.add(mesh); surfaces.push(mesh);
    for (let i = 1; i < 10; i++) {
      const z = ramp.z - ramp.depth / 2 + i / 10 * ramp.depth;
      box(solid, ramp.x, terrainHeight(ramp.x, z) + 0.02, z, ramp.width - 0.14, 0.024, 0.07, '#8d8f74');
    }
  }
  for (const bridge of layout.bridges) {
    const model = scenery('bridge');
    model.position.set(bridge.x, bridge.height, bridge.z);
    model.rotation.y = bridge.rotation;
    solid.add(model); assets.push(model.userData);
    const surface = bridgeSurface(bridge);
    root.add(surface); surfaces.push(surface);
  }
  for (const building of layout.buildings) {
    const model = scenery(building.type, building.color);
    model.position.set(building.x, terrainHeight(building.x, building.z), building.z);
    model.rotation.y = building.rotation;
    model.scale.setScalar(building.scale);
    solid.add(model); assets.push({ ...model.userData, landmark: building.id });
  }
  for (const [index, [x, z, scale, type]] of layout.trees.entries()) {
    const tree = scenery(type);
    tree.position.set(x, terrainHeight(x, z), z);
    tree.scale.setScalar(scale);
    tree.rotation.y = index * 1.37;
    solid.add(tree);
  }
  for (const [index, [x, z, scale]] of layout.rocks.entries()) {
    const rock = scenery('rock');
    rock.position.set(x, terrainHeight(x, z), z);
    rock.scale.set(scale*(0.84+(index%3)*0.08),scale*(0.55+(index%4)*0.13),scale*(0.75+(index%2)*0.2));
    rock.rotation.y = index * 1.62;
    solid.add(rock);
  }
  for (const [x,z,scale] of [[-6,13.1,0.7],[-1,13.2,0.9],[7.2,13.6,1],[16.6,0,0.8],[17.6,-2.5,0.7],[20.5,2,0.65],[-10,14.5,0.8]]) {
    const rock=scenery('rock');
    rock.position.set(x,layout.waterHeight-1.45,z);
    rock.scale.set(scale*1.7,scale*0.85,scale*1.4); rock.rotation.y=x*1.3;
    solid.add(rock);
  }
  for (const [x, z, rotation] of [[-12, 24, 0.8], [-5, 23, -0.6], [27, 10, 1.2], [-18, -10, 0.3]]) {
    const log = scenery('log');
    log.position.set(x, terrainHeight(x, z), z);
    log.rotation.y = rotation;
    solid.add(log);
  }
  for (let i = 0; i < 140; i++) {
    const x = Math.sin(i * 17.9) * 29, z = Math.cos(i * 8.3) * 29;
    const s = terrainSurface(x, z);
    if (s.kind !== 'land' || s.id === 'cliffs' || (Math.abs(x) < 10.9 && Math.abs(z) < 9)) continue;
    if (i % 4 === 0) {
      const cap = cylinder(solid, x + 0.13, s.height + 0.22, z, 0.12, 0.18, 0.09, '#c38469', 7);
      cap.castShadow = false;
      cylinder(solid, x + 0.13, s.height + 0.09, z, 0.025, 0.035, 0.2, '#d9ceb0', 5);
    }
  }
  fence(solid);
  for (let i = 0; i < 6; i++) box(solid, 0, 0.035, 5.2 + i * 0.61, 1.35, 0.06, 0.48, '#d0c7a4', 0.025);
  for (let i = 0; i < 28; i++) {
    const x = -7 + (i % 14) * 1.33, z = -14.15 - Math.floor(i / 14) * 0.5;
    box(solid, x, 1.217, z, 1.25, 0.032, 0.44, i % 3 ? '#c7c1a7' : '#bcb79e', 0.015);
  }
  const pathSamples = [];
  pathRibbon(root, [[-9, -9.7], [0, -9.2], [7, -9.8], [12, -5], [12, 4.5]], 1.5, pathSamples);
  pathRibbon(root, [[0, 8.5], [0.6, 9.5], [2, 10]], 1.4, pathSamples);
  pathRibbon(root, [[2, 17.3], [0, 18.4], [-4, 20], [-8, 20.3]], 1.3, pathSamples);
  pathRibbon(root, [[22, 5], [24, 6], [26, 8]], 1.3, pathSamples);
  for (let x = -7; x < 12; x += 0.5) pathSamples.push({ x, z: -14.4, radius: 1 });
  const grass = createGrass(pathSamples);
  root.add(grass.mesh);
  root.add(batchStaticModel(solid));
  const boat = scenery('boat');
  boat.position.set(-7, layout.waterHeight + 0.035, 13.2);
  boat.rotation.y = -1.05;
  root.add(boat);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    root, surfaces, assets, water, grass, ocean,
    update(time) {
      if (reducedMotion) return;
      grass.update(time);
      ocean.update(time);
      boat.position.y = layout.waterHeight + 0.035 + Math.sin(time * 0.0011) * 0.045;
      boat.rotation.z = Math.sin(time * 0.0008) * 0.028;
    },
    waterTime() { return ocean.time(); },
  };
}
