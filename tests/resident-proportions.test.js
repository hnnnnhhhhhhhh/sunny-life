import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Vector3 } from 'three';
import layout from '../src/resident-layout.json' with {type:'json'};

const resident = (async () => {
  const bytes = await readFile(new URL('../public/models/resident/resident.glb', import.meta.url));
  const loader = new GLTFLoader().register(() => ({ name:'NodeGeometryOnly', loadTexture:()=>Promise.resolve(null) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  return gltf;
})();

for (const outfit of ['shirt','jacket','cardigan']) {
  test(`${outfit} has narrower sloping shoulders and a welded armhole`, async () => {
    const { scene } = await resident;
    const mesh=scene.getObjectByName(`Resident_Top_${outfit}`);
    const position=mesh.geometry.attributes.position, index=mesh.geometry.index;
    const points=Array.from({length:position.count},(_,i)=>mesh.localToWorld(new Vector3().fromBufferAttribute(position,i)));
    const shoulder=points.filter(p=>p.y>1.5&&p.y<1.75);
    const width=Math.max(...shoulder.map(p=>p.x))-Math.min(...shoulder.map(p=>p.x));
    assert.ok(width>0.58&&width<0.62,`shoulder envelope: ${width}`);
    const top=points.find(p=>Math.abs(p.x-0.222)<1e-5&&Math.abs(p.y-1.638)<1e-5);
    const collar=points.find(p=>Math.abs(p.x-0.075)<1e-5&&Math.abs(p.y-1.685)<1e-5);
    assert.ok(top&&collar);
    assert.ok(collar.y-top.y>0.04);

    const key=p=>p.toArray().map(v=>v.toFixed(5)).join(',');
    const edges=new Map();
    for(let i=0;i<index.count;i+=3) {
      const triangle=[0,1,2].map(j=>points[index.getX(i+j)]);
      for(let j=0;j<3;j++) {
        const a=triangle[j],b=triangle[(j+1)%3],id=[key(a),key(b)].sort().join('|');
        const edge=edges.get(id)||{a,b,count:0};
        edge.count++;edges.set(id,edge);
      }
    }
    const inShoulder=p=>p.y>1.48&&p.y<1.65&&Math.abs(p.x)>0.15;
    const exposed=[...edges.values()].filter(e=>e.count===1&&inShoulder(e.a)&&inShoulder(e.b));
    assert.equal(exposed.length,0,'no exposed edge where sleeve and torso join');
    for(let i=0;i<position.count;i++) {
      const weights=mesh.geometry.attributes.skinWeight;
      assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-5);
    }
  });
}

test('narrower arm pivots retain head, hip and foot height references',async()=>{
  const {scene}=await resident;
  const point=name=>scene.getObjectByName(name).getWorldPosition(new Vector3());
  assert.ok(Math.abs(point('UpperArm_R').x-0.218)<1e-5);
  assert.ok(Math.abs(point('UpperArm_R').y-1.635)<1e-5);
  assert.ok(Math.abs(point('Hand_R').x-0.278)<1e-5);
  assert.ok(Math.abs(point('Hips').y-1.08)<1e-5);
  assert.ok(Math.abs(point('Head').y-layout.headBase)<1e-5);
  assert.ok(Math.abs(point('Head').z-layout.headForward)<1e-5);
  assert.ok(Math.abs(point('Mouth').y-layout.mouthHeight)<1e-5);
  assert.ok(Math.abs(point('Foot_R').y-0.09)<1e-5);
});

test('the neck bridge remains inside the back of the new collar',async()=>{
  const {scene}=await resident;
  for(const base of ['female','male']) {
    const neck=[];
    scene.getObjectByName(`Resident_ArtSkin_${base}`).traverse(node=>{
      if(!node.isMesh)return;
      const position=node.geometry.attributes.position;
      for(let i=0;i<position.count;i++) {
        const p=node.localToWorld(new Vector3().fromBufferAttribute(position,i));
        if(p.y>=1.60&&p.y<=1.685)neck.push(p);
      }
    });
    assert.ok(neck.length>20);
    assert.ok(Math.min(...neck.map(p=>p.z))>-0.075,`${base}: neck base must not protrude through the back`);
  }
});
