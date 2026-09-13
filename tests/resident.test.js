import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Vector3 } from 'three';
import { newGame, navigationGrid, validateSave } from '../src/game.js';
import { planMeal, planSeat, planSleep, planWatch, planChat } from '../src/interactions.js';
import { HOUSE_FLOOR, HOUSE_WINDOW } from '../src/architecture.js';

test('windows share the floor and aperture height reference', () => {
  assert.ok(Math.abs(HOUSE_FLOOR + HOUSE_WINDOW.bottom - 1.11) < 1e-8);
  assert.ok(Math.abs((HOUSE_WINDOW.top + HOUSE_WINDOW.bottom) / 2 - HOUSE_WINDOW.center) < 1e-8);
  assert.ok(Math.abs(HOUSE_WINDOW.top - HOUSE_WINDOW.bottom - HOUSE_WINDOW.height) < 1e-8);
});

test('dining plans find a real chair and handle rotations and missing tables', () => {
  const game = newGame();
  const plan = planMeal(game.home, 'dining-1', game.sim, navigationGrid(game.home));
  assert.equal(plan.error, undefined);
  assert.equal(plan.targetId, 'dining-1');
  assert.ok(plan.path.length > 0);
  assert.ok(Math.hypot(plan.seat.x - 3.2, plan.seat.z + 1.4) < 0.81);
  assert.equal(plan.floor, 0.25);
  const kitchenPlan = planMeal(game.home, 'kitchen-1', game.sim, navigationGrid(game.home));
  assert.equal(kitchenPlan.targetId, 'dining-1');
  const noTable = { ...game.home, furniture: game.home.furniture.filter(f => f.type !== 'dining') };
  assert.match(planMeal(noTable, 'kitchen-1', game.sim, navigationGrid(noTable)).error, /餐桌/);
  const rotated = { ...game.home, furniture: [{ ...game.home.furniture.find(f => f.type === 'dining'), x: 0, z: 0, rotation: Math.PI / 2 }], walls: [] };
  const result = planMeal(rotated, 'dining-1', { x: 0, z: 4 }, navigationGrid(rotated));
  assert.equal(result.error, undefined);
  assert.ok(Math.abs(result.seat.x) > 0.7);
});

test('outfits preserve legacy saves and reject unsupported variants', () => {
  const game = newGame();
  assert.equal(validateSave(game), true);
  delete game.avatar.outfit;
  assert.equal(validateSave(game), true);
  game.avatar.outfit = 'cardigan';
  assert.equal(validateSave(game), true);
  game.avatar.outfit = 'unknown';
  assert.equal(validateSave(game), false);
});

test('the Blender resident has a real skin, skeleton, clothing and changing animation poses', async () => {
  const manifest = JSON.parse(await readFile(new URL('../src/assets/resident-manifest.json', import.meta.url), 'utf8'));
  const bytes = await readFile(new URL(`../public/${manifest.file}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  // Node validates mesh and animation data; browser tests decode and render textures.
  const loader = new GLTFLoader().register(() => ({ name: 'NodeGeometryOnly', loadTexture: () => Promise.resolve(null) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  for (const name of manifest.animations) assert.ok(gltf.animations.some(a => a.name === name), name);
  let skinned;
  const variants = new Set();
  gltf.scene.traverse(node => {
    if (node.isSkinnedMesh) skinned = node;
    if (node.userData.variant) variants.add(node.userData.variant);
  });
  assert.equal(skinned.skeleton.bones.length, 29);
  for(const name of ['Palm_L','Palm_R','WashTarget_L','WashTarget_R'])assert.ok(skinned.skeleton.bones.some(b=>b.name===name));
  for (const name of ['shirt', 'jacket', 'cardigan', 'hair:bob', 'hair:short', 'hair:bun', 'hair:curly']) assert.ok(variants.has(name), name);
  gltf.scene.updateMatrixWorld(true);
  for (const base of ['female', 'male']) {
    const head = gltf.scene.getObjectByName(`Resident_Skin_${base}`);
    let neckWidth = 0, vertices = 0;
    head.traverse(node => {
      if (!node.isMesh) return;
      const position = node.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const p = node.localToWorld(new Vector3().fromBufferAttribute(position, i));
        if (p.y > 1.72 && p.y < 1.78) { neckWidth = Math.max(neckWidth, Math.abs(p.x)); vertices++; }
      }
    });
    assert.ok(vertices > 3);
    assert.ok(neckWidth < 0.12, `${base}: neck remains narrower than the head`);
    assert.ok(head.userData.source_parts.some(p=>p.endsWith('_Head')));
  }
  const hand = gltf.scene.getObjectByName('Hand_R');
  const mixer = new AnimationMixer(gltf.scene);
  mixer.clipAction(gltf.animations.find(a => a.name === 'Eat')).play();
  mixer.update(0.1); gltf.scene.updateMatrixWorld(true);
  const start = hand.getWorldPosition(new Vector3());
  mixer.update(1.2); gltf.scene.updateMatrixWorld(true);
  assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(start) > 0.15);
  const source = await readFile(new URL(`../${manifest.source}`, import.meta.url));
  assert.ok(source.length > 50000);
});

test('seat, bed, TV and chat plans select reachable physical interaction locations', () => {
  const game = newGame(), home = game.home, grid = navigationGrid(home);
  const get = type => home.furniture.find(item => item.type === type);
  const seat = planSeat(home, get('sofa'), game.sim, grid);
  assert.equal(seat.seatTop, 0.68);
  assert.equal(seat.seat.x, get('sofa').x);
  const watch = planWatch(home, get('tv'), game.sim, grid);
  assert.equal(watch.seatId, get('sofa').id);
  assert.equal(watch.televisionId, get('tv').id);
  const bed = planSleep(home, get('bed'), game.sim, grid);
  assert.equal(bed.pillow.z, get('bed').z - 0.95);
  assert.ok(bed.sleepY > 0.8);
  const chat = planChat(home, { x: 7, z: 10.2 }, game.sim, grid);
  assert.ok(chat.path.length > 0);
  assert.ok(Math.hypot(chat.approach.x - 7, chat.approach.z - 10.2) > 0.85);
  const noSeats = { ...home, furniture: home.furniture.filter(item => !['sofa','chair','bench'].includes(item.type)) };
  assert.match(planWatch(noSeats, get('tv'), game.sim, navigationGrid(noSeats)).error, /座椅/);
});
