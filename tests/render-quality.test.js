import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {QualityMaterials} from '../src/render-quality.js';

test('low quality keeps authored maps, tint and identity while removing physical shading',()=>{
  const root=new THREE.Group(),map=new THREE.Texture();
  const original=new THREE.MeshPhysicalMaterial({color:'#789a83',map,emissive:'#ffeecc',emissiveIntensity:.4,transparent:true,opacity:.3});
  original.name='Dye_Main_sofa';
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),original);root.add(mesh);
  const manager=new QualityMaterials();manager.update(root,true);
  assert.ok(mesh.material.isMeshLambertMaterial);assert.equal(mesh.material.map,map);
  assert.equal(mesh.material.name,original.name);assert.equal(mesh.material.color,original.color);
  original.emissiveIntensity=.8;original.opacity=.65;
  manager.update(root,true);
  assert.equal(mesh.material.emissiveIntensity,.8);assert.equal(mesh.material.opacity,.65);
  mesh.material.emissiveIntensity=1.2;mesh.material.opacity=.75;
  assert.equal(original.emissiveIntensity,1.2);assert.equal(original.opacity,.75);
  manager.update(root,false);assert.equal(mesh.material,original);
  manager.dispose(root);mesh.geometry.dispose();original.dispose();map.dispose();
});
test('quality toggling preserves screens and handles replaced materials and arrays',()=>{
  const root=new THREE.Group(),screen=new THREE.MeshBasicMaterial(),a=new THREE.MeshStandardMaterial(),b=new THREE.MeshStandardMaterial();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),[screen,a]);root.add(mesh);
  const q=new QualityMaterials();q.update(root,true);
  assert.equal(mesh.material[0],screen);assert.ok(mesh.material[1].isMeshLambertMaterial);
  mesh.material=b;q.update(root,true);assert.ok(mesh.material.isMeshLambertMaterial);
  root.visible=false;q.dispose(root);assert.equal(mesh.material,b);
  mesh.geometry.dispose();screen.dispose();a.dispose();b.dispose();
});
