import * as THREE from 'three';

export function createBathroomEffects(type, fixture, floor) {
  const group = new THREE.Group(), materials = [], geometries = [];
  group.name = type === 'shower' ? 'ShowerPrivacy' : 'ToiletPrivacy';
  group.position.set(fixture.x, floor, fixture.z);
  group.rotation.y = fixture.rotation;
  const curtain = new THREE.MeshStandardMaterial({ color: '#dae6e3', roughness: 0.94, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: '#869da0', roughness: 0.5, metalness: 0.35 });
  materials.push(curtain, trim);
  const panel = (x, y, z, w, h, d, material) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh); geometries.push(geometry);
    return mesh;
  };
  const width = type === 'shower' ? 1.3 : 1.1;
  const front = type === 'shower' ? 0.67 : 1.05;
  const top = type === 'shower' ? 1.83 : 1.25;
  for (let i = 0; i < 14; i++) {
    panel(-width / 2 + (i + 0.5) * width / 14, (top + 0.22) / 2, front + (i % 2) * 0.02, width / 14 + 0.005, top - 0.22, 0.035, curtain);
  }
  for (const side of [-1, 1]) {
    panel(side * width / 2, top / 2, front, 0.025, top, 0.025, trim);
    if (type === 'toilet') panel(side * width / 2, (top + 0.22) / 2, 0.25, 0.035, top - 0.22, 1.6, curtain);
  }
  panel(0, top + 0.02, front, width + 0.06, 0.025, 0.025, trim);
  let water, positions, time = 0, running = false;
  if (type === 'shower') {
    const geometry = new THREE.BufferGeometry();
    positions = new Float32Array(96 * 6);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: '#f0ffff', transparent: true, opacity: 0.78 });
    water = new THREE.LineSegments(geometry, material);
    water.frustumCulled = false;
    group.add(water); geometries.push(geometry); materials.push(material);
  }
  return {
    group,
    update(seconds, weight = 1, flowing = true) {
      time = seconds; running = flowing;
      group.visible = weight > 0.35;
      if (!water) return;
      water.visible = flowing;
      for (let i = 0; i < 96; i++) {
        const angle = i * 2.39996, radius = Math.sqrt((i % 17) / 17) * 0.24;
        const y = 2.04 - ((seconds * 1.6 + i * 0.173) % 1.9);
        positions.set([Math.cos(angle) * radius, y, Math.sin(angle) * radius - 0.09,
          Math.cos(angle) * radius, y - 0.065, Math.sin(angle) * radius - 0.09], i * 6);
      }
      water.geometry.attributes.position.needsUpdate = true;
    },
    diagnostics() { return { type, time, running, visible: group.visible, drops: water ? 96 : 0 }; },
    dispose() {
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}
