import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ITEM_MAP } from '../src/game.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('src/assets/blender-manifest.json', root), 'utf8'));
const loader = new GLTFLoader();

test('the Blender source and manifest are shipped with the project', async () => {
  assert.match(manifest.generator, /^Blender 4\.5/);
  assert.deepEqual(manifest.assets.map(a => a.type).sort(), ['bed', 'chair', 'coffee', 'lamp', 'plant', 'sofa']);
  const source = await readFile(new URL(manifest.source, root));
  assert.ok(source.length > 10000);
  // Blender 4.5 can compress .blend files with Zstandard rather than gzip.
  const header = source.subarray(0, 7).toString();
  assert.ok(header === 'BLENDER' || source.readUInt32LE(0) === 0xfd2fb528 || source.readUInt16LE(0) === 0x8b1f);
});

for (const asset of manifest.assets) {
  test(`${asset.type}: GLB loads, is grounded, fits collision bounds, and exposes dye materials`, async () => {
    const buffer = await readFile(new URL(`public/${asset.file}`, root));
    assert.equal(buffer.readUInt32LE(0), 0x46546c67);
    assert.equal(buffer.readUInt32LE(4), 2);
    assert.equal(buffer.readUInt32LE(8), buffer.length);
    assert.equal(buffer.length, asset.bytes);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), asset.sha256);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const { scene } = await loader.parseAsync(arrayBuffer, '');
    const bounds = new Box3().setFromObject(scene);
    const info = ITEM_MAP[asset.type];
    assert.ok(Math.abs(bounds.min.y) < 0.01);
    assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) <= info.width / 2 + 0.025);
    assert.ok(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= info.depth / 2 + 0.025);
    assert.ok(bounds.max.y > 0.5 && bounds.max.y < 2);
    const meshMaterials = [];
    let triangles = 0;
    scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      meshMaterials.push(mesh.material);
      triangles += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3;
      assert.ok(mesh.geometry.attributes.normal);
    });
    assert.ok(meshMaterials.some(material => material.name.startsWith('Dye_Main_')));
    assert.ok(meshMaterials.every(material => material.isMeshStandardMaterial || material.isMeshPhysicalMaterial));
    assert.ok(meshMaterials.length <= 10);
    assert.equal(triangles, asset.triangles);
    assert.ok(triangles < 16000);
    assert.ok(buffer.length < 300000);
  });
}
