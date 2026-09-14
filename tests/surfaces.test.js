import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Mesh,MeshStandardMaterial} from 'three';
import {createSurfaceMaps,SURFACE_SPECS} from '../src/surface-patterns.js';
import {applySurface,loadSurfaceAssets} from '../src/surfaces.js';

for(const kind of Object.keys(SURFACE_SPECS))test(`${kind} has deterministic color, unit normals and roughness maps`,()=>{
  const a=createSurfaceMaps(kind,128),b=createSurfaceMaps(kind,128);
  assert.deepEqual(a.color.image.data,b.color.image.data);
  assert.ok(new Set(a.color.image.data).size>8);
  const data=a.normal.image.data;
  for(let i=0;i<data.length;i+=4){
    const length=Math.hypot(...[0,1,2].map(axis=>data[i+axis]/255*2-1));
    assert.ok(Math.abs(length-1)<.015);
    assert.equal(data[i+3],255);
  }
  assert.equal(a.color.colorSpace,'srgb');
  assert.equal(a.normal.colorSpace,'');
});

test('surface application preserves tint identity and leaves shared source geometry intact',async()=>{
  await loadSurfaceAssets();
  const material=new MeshStandardMaterial({color:'#739486'});
  material.name='Dye_Main_sofa';
  const geometry=new BoxGeometry(1,1,1),mesh=new Mesh(geometry,material);
  mesh.scale.set(3,1,1);
  applySurface(mesh,'linen');
  assert.equal(mesh.material.color.getHexString(),'739486');
  assert.equal(mesh.material.name,'Dye_Main_sofa');
  assert.equal(mesh.material.isMeshPhysicalMaterial,true);
  assert.ok(mesh.material.normalMap&&mesh.material.roughnessMap);
  assert.notEqual(mesh.geometry,geometry);
  assert.equal(geometry.attributes.position.count,24);
  assert.equal(material.map,null);
});
