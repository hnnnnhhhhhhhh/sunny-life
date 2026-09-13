import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import layout from '../src/resident-layout.json' with {type:'json'};

const resident=(async()=>{
  const bytes=await readFile(new URL('../public/models/resident/resident.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  return gltf;
})();

for(const base of ['female','male'])for(const outfit of ['shirt','jacket','cardigan']) {
  test(`${base} ${outfit} retains complete source body, symmetric limbs and normalized skin`,async()=>{
    const {scene}=await resident,mesh=scene.getObjectByName(`Resident_Top_${outfit}_${base}`);
    assert.ok(mesh.userData.source_parts.some(part=>part.endsWith('_Body')));
    const position=mesh.geometry.attributes.position,weight=mesh.geometry.attributes.skinWeight;
    const points=Array.from({length:position.count},(_,i)=>mesh.localToWorld(new Vector3().fromBufferAttribute(position,i)));
    const shoulder=points.filter(p=>p.y>1.5&&p.y<1.78);
    const left=Math.min(...shoulder.map(p=>p.x)),right=Math.max(...shoulder.map(p=>p.x));
    assert.ok(right-left>.40&&right-left<.65,`shoulder envelope: ${right-left}`);
    assert.ok(Math.abs(left+right)<.01,'both mirrored halves survive export');
    assert.ok(mesh.geometry.index.count/3>400,'authored surface triangles survive smooth-normal vertex sharing');
    for(let i=0;i<weight.count;i++)
      assert.ok(Math.abs(weight.getX(i)+weight.getY(i)+weight.getZ(i)+weight.getW(i)-1)<1e-5);
    for(const role of ['Trousers','Shoes']) {
      const m=scene.getObjectByName(`Resident_${role}_${base}`),a=m.geometry.attributes.position;
      const xs=Array.from({length:a.count},(_,i)=>m.localToWorld(new Vector3().fromBufferAttribute(a,i)).x);
      assert.ok(xs.filter(x=>x<-.04).length>100);
      assert.ok(xs.filter(x=>x>.04).length>100);
      assert.ok(m.userData.source_parts.some(p=>p.endsWith(role==='Shoes'?'_Feet':'_Legs')));
    }
  });
}

test('interaction anchors and complete source head remain available',async()=>{
  const {scene}=await resident,point=name=>scene.getObjectByName(name).getWorldPosition(new Vector3());
  assert.ok(Math.abs(point('UpperArm_R').x-.18)<1e-5);
  assert.ok(Math.abs(point('Hips').y-1.08)<1e-5);
  assert.ok(Math.abs(point('Head').y-layout.headBase)<1e-5);
  assert.ok(Math.abs(point('Mouth').y-layout.mouthHeight)<1e-5);
  assert.ok(Math.abs(point('Foot_R').y-.09)<1e-5);
  for(const base of ['female','male']) {
    const head=scene.getObjectByName(`Resident_Skin_${base}`);
    assert.ok(head.userData.source_parts.some(p=>p.endsWith('_Head')));
    const hp=head.geometry.attributes.position,hi=head.geometry.index,edges=new Map();
    const points=Array.from({length:hp.count},(_,i)=>head.localToWorld(new Vector3().fromBufferAttribute(hp,i)));
    const key=p=>p.toArray().map(v=>v.toFixed(5)).join(',');
    for(let i=0;i<hi.count;i+=3)for(let j=0;j<3;j++) {
      const a=points[hi.getX(i+j)],b=points[hi.getX(i+(j+1)%3)];
      if(a.y<1.84||b.y<1.84||a.z>.145||b.z>.145)continue;
      const id=[key(a),key(b)].sort().join('|');
      edges.set(id,(edges.get(id)||0)+1);
    }
    assert.equal([...edges.values()].filter(n=>n===1).length,0,'no open scalp under alternate hair');
    const shoe=scene.getObjectByName(`Resident_Shoes_${base}`),p=shoe.geometry.attributes.position;
    const low=Math.min(...Array.from({length:p.count},(_,i)=>shoe.localToWorld(new Vector3().fromBufferAttribute(p,i)).y));
    assert.ok(low>=-.002&&low<.006,`${base} soles contact floor: ${low}`);
  }
});
