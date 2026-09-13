import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

test('compressed resident delivery expands to the exact validated GLB',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../src/assets/resident-manifest.json',import.meta.url),'utf8'));
  const raw=await readFile(new URL(`../public/${manifest.file}`,import.meta.url));
  const compressed=await readFile(new URL(`../public/${manifest.compressedFile}`,import.meta.url));
  assert.deepEqual(gunzipSync(compressed),raw);
  assert.equal(compressed.length,manifest.compressedBytes);
  assert.equal(createHash('sha256').update(compressed).digest('hex'),manifest.compressedSha256);
  assert.ok(compressed.length<1600000);
  assert.ok(compressed.length<raw.length*.6);
});
