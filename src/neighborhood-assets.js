import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import manifest from './assets/neighborhood-manifest.json' with {type:'json'};
import {downloadAsset} from './asset-download.js';
import {applySurface} from './surfaces.js';

const templates=new Map(),tints=new Map();
let loading,error;
export function loadNeighborhoodAssets(){
  if(loading)return loading;
  loading=(async()=>{
    try{
      const compressed=typeof DecompressionStream!=='undefined';
      const file=compressed?manifest.compressedFile:manifest.file,hash=compressed?manifest.compressedSha256:manifest.sha256;
      let bytes=await downloadAsset(`${import.meta.env.BASE_URL}${file}?v=${hash.slice(0,12)}`,{
        expectedBytes:compressed?manifest.compressedBytes:manifest.bytes,decodedBytes:manifest.bytes,idleMs:30000});
      const signature=new Uint8Array(bytes,0,2);
      if(compressed&&signature[0]===0x1f&&signature[1]===0x8b)
        bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const scene=(await new GLTFLoader().parseAsync(bytes,'')).scene;
      for(const asset of manifest.assets){
        const node=scene.getObjectByName(asset.node);
        if(!node)throw new Error(`Missing neighborhood asset: ${asset.type}`);
        templates.set(asset.type,node);
      }
    }catch(e){
      error=e.message;templates.clear();
      console.warn('Neighborhood models unavailable; using built-in scenery.',error);
    }
    return neighborhoodAssetStatus();
  })();
  return loading;
}

export function createNeighborhoodModel(type,color){
  const template=templates.get(type);
  if(!template)return null;
  const root=new THREE.Group();root.name=`Imported_${type}`;
  root.userData={source:'neighborhood',type,asset:manifest.file};
  template.updateWorldMatrix(true,false);
  const instance=template.clone(true);
  template.matrixWorld.decompose(instance.position,instance.quaternion,instance.scale);
  instance.traverse(node=>{
    if(!node.isMesh)return;
    node.castShadow=node.receiveShadow=true;
    if(color){
      const tint=material=>{
        if(!material.name.startsWith('Dye_Main_'))return material;
        const key=`${material.uuid}:${color}`;
        if(!tints.has(key)){
          const copy=material.clone();copy.color.set(color);
          if(copy.sheenColor)copy.sheenColor.set(color).lerp(new THREE.Color('#e9eee7'),.3);
          tints.set(key,copy);
        }
        return tints.get(key);
      };
      node.material=Array.isArray(node.material)?node.material.map(tint):tint(node.material);
    }
    if(node.userData.curtainCloth)applySurface(node,'linen');
  });
  root.add(instance);
  return root;
}
export function neighborhoodAssetStatus(){return {loaded:[...templates.keys()],total:manifest.assets.length,error:error||null};}
