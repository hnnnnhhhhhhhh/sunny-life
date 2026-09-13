import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {Box3,Vector3,Raycaster} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ITEM_MAP} from '../src/game.js';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('src/assets/supplied-manifest.json',root),'utf8'));
const bytes=await readFile(new URL(`public/${manifest.file}`,root));
const loader=new GLTFLoader()
  .register(()=>({name:'EXT_texture_webp',loadTexture:()=>Promise.resolve(null)}))
  .register(()=>({name:'NodeGeometryOnly',loadTexture:()=>Promise.resolve(null)}));
const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
gltf.scene.updateMatrixWorld(true);
function part(asset,name) {
  let found;
  asset.traverse(node=>{if(node.userData.part===name)found=node;});
  return found;
}

test('supplied pack is compact, hash-matched, and carries public attribution',async()=>{
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
  const compressed=await readFile(new URL(`public/${manifest.compressedFile}`,root));
  assert.deepEqual(gunzipSync(compressed),bytes);
  assert.equal(compressed.length,manifest.compressedBytes);
  assert.equal(createHash('sha256').update(compressed).digest('hex'),manifest.compressedSha256);
  assert.ok(compressed.length<350000);
  assert.equal(manifest.license,'CC-BY-SA-4.0');
  const license=await readFile(new URL('public/models/supplied/LICENSE.txt',root),'utf8');
  for(const name of ['littledica','5Life','BenK656','creativecommons.org/licenses/by-sa/4.0/'])assert.ok(license.includes(name));
  assert.ok((await readFile(new URL(manifest.source,root))).length>10000);
});

for(const asset of manifest.assets)test(`${asset.type} fits existing placement and retains authored geometry`,()=>{
  const model=gltf.scene.getObjectByName(asset.node),box=new Box3().setFromObject(model);
  assert.ok(model);
  if(asset.grounded) {
    assert.deepEqual(asset.footprint,[ITEM_MAP[asset.type].width,ITEM_MAP[asset.type].depth]);
    assert.ok(Math.abs(box.min.y)<.01);
  }
  assert.ok(Math.max(Math.abs(box.min.x),Math.abs(box.max.x))<=asset.footprint[0]/2+.025);
  assert.ok(Math.max(Math.abs(box.min.z),Math.abs(box.max.z))<=asset.footprint[1]/2+.025);
  let triangles=0,authored=false;
  model.traverse(node=>{
    if(node.userData.sourceAsset)authored=true;
    if(!node.isMesh)return;
    triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
    assert.ok(node.geometry.attributes.normal);
    assert.equal(node.isSkinnedMesh,undefined);
  });
  assert.equal(triangles,asset.triangles);
  assert.ok(authored);
  assert.ok(triangles<6000);
});

for(const type of ['sink','kitchen'])test(`${type} has a real basin below the unchanged handwash outlet`,()=>{
  const model=gltf.scene.getObjectByName(`Supplied_${type}`),x=type==='kitchen'?-1.13:0;
  const hits=new Raycaster(new Vector3(x,1.19,.07),new Vector3(0,-1,0)).intersectObject(model,true);
  assert.ok(hits.length);
  assert.ok(hits[0].point.y<.98&&hits[0].point.y>.65,`basin height ${hits[0].point.y}`);
  const handle=part(model,'TapHandle'),pump=part(model,'SoapPump');
  assert.ok(handle&&pump);
  assert.ok(handle.getWorldPosition(new Vector3()).distanceTo(new Vector3(x+.44,1.12,.22))<1e-5);
  assert.ok(pump.getWorldPosition(new Vector3()).distanceTo(new Vector3(x-.45,1.23,.22))<1e-5);
});

test('toilet handle is distinct from the body and seat matches the interaction contract',()=>{
  const model=gltf.scene.getObjectByName('Supplied_toilet'),handle=part(model,'FlushHandle'),body=part(model,'ToiletBody');
  assert.ok(handle&&body&&handle!==body);
  assert.ok(new Box3().setFromObject(handle).getSize(new Vector3()).length()<.25);
  const hits=new Raycaster(new Vector3(.195,.8,.12),new Vector3(0,-1,0)).intersectObject(body,true);
  assert.ok(hits.length);
  assert.ok(Math.abs(hits[0].point.y-.59)<.015,`seat height ${hits[0].point.y}`);
  assert.ok(part(model,'ToiletWater'));
});
