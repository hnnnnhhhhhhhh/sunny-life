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
  } else if (recipe === 'noodles') {
    for (let i = 0; i < 20; i++) {
      const strand = add(food, new THREE.TorusGeometry(.08 + (i % 4) * .02, .006, 5, 22, Math.PI * 1.8),
        butter, Math.sin(i * 2.4) * .035, .04 + i * .003, Math.cos(i * 2.4) * .035);
      strand.rotation.set(Math.PI / 2 + .15 * Math.sin(i), i, i * .4);
    }
    for (let i = 0; i < 5; i++) add(food, new THREE.BoxGeometry(.04,.008,.02), leaves, Math.sin(i)*.1,.12,Math.cos(i)*.09);
  } else if (recipe === 'steak') {
    const meat=mat('#875545'),char=mat('#4e3731');
    const cut=add(food,new THREE.SphereGeometry(1,24,12),meat,-.025,.065,0);
    cut.scale.set(.14,.04,.105);
    for(let i=0;i<5;i++){
      const line=add(food,new THREE.BoxGeometry(.008,.004,.13),char,-.1+i*.038,.103,0);
      line.rotation.y=.35;
    }
    for(let i=0;i<3;i++)add(food,new THREE.IcosahedronGeometry(.035,1),leaves,.145,.064,(i-1)*.07);
  } else if (recipe === 'toast') {
    add(food,new THREE.BoxGeometry(.24,.045,.19),cake,0,.05,0);
    add(food,new THREE.BoxGeometry(.21,.006,.16),butter,0,.076,0);
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
