import * as THREE from 'three';

export function createMeal(recipe = 'pancakes') {
  const group = new THREE.Group(), food = new THREE.Group();
  const resources = [];
  const mat = color => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
    resources.push(value);
    return value;
  };
  const ceramic = mat('#eee8da'), cake = mat('#dab27e'), syrup = mat('#b87742');
  const leaves = mat('#7c9b58'), berry = mat('#565875'), butter = mat('#e9c76b');
  function add(parent, geo, material, x, y, z) {
    resources.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }
  const profile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.245, 0.025), new THREE.Vector2(0.245, 0.047),
    new THREE.Vector2(0.21, 0.045), new THREE.Vector2(0.15, 0.024), new THREE.Vector2(0, 0.024),
  ];
  add(group, new THREE.LatheGeometry(profile, 28), ceramic, 0, 0, 0);
  group.add(food);
  if (recipe === 'pancakes') {
    for (let i = 0; i < 3; i++) add(food, new THREE.CylinderGeometry(0.157, 0.16, 0.035, 24), cake, 0, 0.045 + i * 0.032, 0);
    add(food, new THREE.CylinderGeometry(0.137, 0.146, 0.01, 18), syrup, 0.004, 0.135, 0);
    const knob = add(food, new THREE.BoxGeometry(0.065, 0.018, 0.051), butter, -0.024, 0.15, 0.01);
    knob.rotation.y = 0.3;
    for (let i = 0; i < 5; i++) {
      const angle = i * 0.55;
      add(food, new THREE.IcosahedronGeometry(0.027, 1), berry, Math.cos(angle) * 0.188, 0.055, Math.sin(angle) * 0.188);
    }
  } else {
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.4, radius = 0.03 + (i % 3) * 0.045;
      const leaf = add(food, new THREE.IcosahedronGeometry(0.065, 0), leaves, Math.cos(angle) * radius, 0.065 + (i % 2) * 0.035, Math.sin(angle) * radius);
      leaf.scale.set(1, 0.42, 0.73);
      leaf.rotation.z = angle;
    }
    const tomato = mat('#c87d59');
    for (let i = 0; i < 4; i++) add(food, new THREE.IcosahedronGeometry(0.034, 1), tomato, Math.sin(i * 2.1) * 0.11, 0.09, Math.cos(i * 2.1) * 0.11);
  }
  const cup = add(group, new THREE.CylinderGeometry(0.064, 0.055, 0.14, 20), ceramic, -0.33, 0.07, 0.07);
  const tea = mat('#80533a');
  add(group, new THREE.CylinderGeometry(0.052, 0.052, 0.006, 20), tea, -0.33, 0.142, 0.07);
  const handle = add(group, new THREE.TorusGeometry(0.038, 0.01, 6, 16), ceramic, -0.394, 0.08, 0.07);
  handle.rotation.y = Math.PI / 2;
  group.userData.food = food;
  return {
    group,
    update(progress) {
      const remaining = 1 - progress;
      food.visible = remaining > 0.025;
      food.scale.setScalar(Math.max(0.2, Math.sqrt(remaining)));
      cup.rotation.z = 0;
    },
    dispose() { resources.forEach(resource => resource.dispose()); },
  };
}
