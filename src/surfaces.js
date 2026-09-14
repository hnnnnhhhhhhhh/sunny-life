import * as THREE from 'three';
import {createSurfaceMaps,SURFACE_SPECS} from './surface-patterns.js';

const textures=new Map(),materials=new Map(),projected=new WeakMap();
let loading;
export function loadSurfaceAssets() {
  if(loading)return loading;
  loading=Promise.resolve().then(()=>{
    for(const kind of Object.keys(SURFACE_SPECS))textures.set(kind,createSurfaceMaps(kind));
    return surfaceStatus();
  });
  return loading;
}

export function surfaceMaterial(original,kind,options={}) {
  const surface=textures.get(kind);
  if(!surface)return original;
  const key=`${original.uuid}:${kind}:${JSON.stringify(options)}`;
  if(!materials.has(key)) {
    const material=kind==='linen'?new THREE.MeshPhysicalMaterial():original.clone();
    if(kind==='linen')THREE.MeshStandardMaterial.prototype.copy.call(material,original);
    material.name=original.name;
    if(!original.map)material.map=surface.color;
    material.normalMap=surface.normal;
    material.normalScale=new THREE.Vector2(kind==='plaster'?.18:.35,kind==='plaster'?.18:.35);
    material.roughnessMap=surface.roughness;
    material.roughness=kind==='oak'?.58:kind==='stone'?.68:kind==='linen'?.96:.88;
    if(kind==='linen'){material.sheen=.28;material.sheenColor=new THREE.Color('#e6e7e1');material.sheenRoughness=.85;}
    Object.assign(material,options);
    material.userData={...original.userData,surface:kind};
    materials.set(key,material);
  }
  return materials.get(key);
}

export function applySurface(mesh,kind,options={}) {
  if(!textures.has(kind)||!mesh.isMesh)return mesh;
  // Box projection uses actual dimensions, so a wall and a small cushion share
  // a consistent texel scale. Imported UVs with authored color maps stay intact.
  const authored=Array.isArray(mesh.material)?mesh.material.some(m=>m.map):mesh.material.map;
  if(!authored) {
    const scale=textures.get(kind).meters;
    const key=`${kind}:${mesh.scale.toArray().join(',')}`;
    let variants=projected.get(mesh.geometry);
    if(!variants){variants=new Map();projected.set(mesh.geometry,variants);}
    if(!variants.has(key)) {
      const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
      const p=geometry.attributes.position,uv=new Float32Array(p.count*2);
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
      for(let i=0;i<p.count;i+=3) {
        a.fromBufferAttribute(p,i).multiply(mesh.scale);
        b.fromBufferAttribute(p,i+1).multiply(mesh.scale);
        c.fromBufferAttribute(p,i+2).multiply(mesh.scale);
        normal.crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();
        const axes=Math.abs(normal.y)>.55?['x','z']:Math.abs(normal.x)>.55?['z','y']:['x','y'];
        for(let j=0;j<3;j++){
          a.fromBufferAttribute(p,i+j).multiply(mesh.scale);
          uv[(i+j)*2]=a[axes[0]]/scale;
          uv[(i+j)*2+1]=a[axes[1]]/scale;
        }
      }
      geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
      variants.set(key,geometry);
    }
    mesh.geometry=variants.get(key);
  }
  mesh.material=Array.isArray(mesh.material)
    ?mesh.material.map(m=>surfaceMaterial(m,kind,options)):surfaceMaterial(mesh.material,kind,options);
  return mesh;
}

export function dressFurnitureSurfaces(root,type) {
  root.traverse(mesh=>{
    if(!mesh.isMesh||Array.isArray(mesh.material))return;
    const name=mesh.material.name;
    let kind;
    if(/linen|fabric|duvet|pillow|quilt|mattress|throw|cotton/i.test(name))kind='linen';
    else if(/oak|wood|walnut|timber/i.test(name))kind='oak';
    else if(/stone|countertop|marble/i.test(name))kind='stone';
    else if(/Dye_(Main|Seam)_(sofa|chair|bed)/.test(name))kind='linen';
    if(kind)applySurface(mesh,kind);
  });
  return root;
}

export function surfaceStatus(){return {loaded:[...textures.keys()],total:Object.keys(SURFACE_SPECS).length};}
