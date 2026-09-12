import * as THREE from 'three';
import { onFloor } from './architecture.js';
import { footprint } from './game.js';
import { layout, terrainSurface, WORLD_COLLIDERS } from './terrain.js';

export function lowPolySurface(polygon, color, height) {
  const contour = polygon.map(([x, z]) => new THREE.Vector2(x, z));
  const positions = [], colors = [], base = new THREE.Color(color);
  const point = index => new THREE.Vector3(polygon[index][0], height, polygon[index][1]);
  function triangle(a, b, c, depth) {
    if (depth > 0) {
      const ab = a.clone().lerp(b, 0.5), bc = b.clone().lerp(c, 0.5), ca = c.clone().lerp(a, 0.5);
      triangle(a, ab, ca, depth - 1); triangle(ab, b, bc, depth - 1);
      triangle(ca, bc, c, depth - 1); triangle(ab, bc, ca, depth - 1);
      return;
    }
    const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const shade = 0.97 + Math.sin(center.x * 0.63 + center.z * 0.43) * 0.045 + Math.cos(center.z * 0.9) * 0.025;
    const tint = base.clone().multiplyScalar(shade);
    const vertices = b.clone().sub(a).cross(c.clone().sub(a)).y > 0 ? [a,b,c] : [a,c,b];
    vertices.forEach(p => { positions.push(p.x, p.y, p.z); colors.push(tint.r, tint.g, tint.b); });
  }
  THREE.ShapeUtils.triangulateShape(contour, []).forEach(indices => triangle(...indices.map(point), 2));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  mesh.receiveShadow = true;
  mesh.userData.disposable = mesh.userData.ownMaterial = true;
  return mesh;
}

export function createGrass(pathSamples) {
  const samples = [];
  for (const [i, [x, z]] of layout.trees.entries()) for (let j = 0; j < 5; j++) {
    const angle = j * 2.399 + i, radius = 0.9 + (j % 3) * 0.24;
    const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius, s = terrainSurface(px, pz);
    if (!['land', 'terrace'].includes(s.kind) || (Math.abs(px) < 10.5 && Math.abs(pz) < 8.5)) continue;
    if (WORLD_COLLIDERS.some(b => Math.abs(px-b.x) < b.width/2+0.1 && Math.abs(pz-b.z) < b.depth/2+0.1)) continue;
    if (pathSamples.some(p => Math.hypot(p.x-px,p.z-pz) < p.radius)) continue;
    samples.push({ x:px, y:s.height, z:pz, angle, scale:0.7+(j%3)*0.2 });
  }
  const geometry = new THREE.ConeGeometry(0.16, 0.36, 4);
  geometry.translate(0, 0.18, 0);
  const material = new THREE.MeshStandardMaterial({ color:'#769b51', flatShading:true, roughness:1 });
  const mesh = new THREE.InstancedMesh(geometry, material, samples.length * 3);
  mesh.name = 'LowPolyGrassClusters';
  mesh.userData.disposable = mesh.userData.ownMaterial = true;
  const dummy = new THREE.Object3D();
  let count = 0;
  return {
    mesh,
    updateHome(home) {
      const furniture = home.furniture.map(f => ({ ...f, ...footprint(f) }));
      count = 0;
      for (const p of samples) {
        if (onFloor(home,p.x,p.z,0.3) || furniture.some(f => Math.abs(f.x-p.x)<f.width/2+0.3 && Math.abs(f.z-p.z)<f.depth/2+0.3)) continue;
        for (let i=0;i<3;i++) {
          dummy.position.set(p.x+(i-1)*0.15,p.y,p.z);
          dummy.rotation.set(0,p.angle,(i-1)*0.28);
          dummy.scale.setScalar(p.scale*(i===1?1:0.65));
          dummy.updateMatrix(); mesh.setMatrixAt(count++,dummy.matrix);
        }
      }
      mesh.count=count; mesh.instanceMatrix.needsUpdate=true; mesh.computeBoundingSphere();
    },
    update() {},
    diagnostics() { return { style:'low-poly', clusters:samples.length, blades:count }; },
  };
}
