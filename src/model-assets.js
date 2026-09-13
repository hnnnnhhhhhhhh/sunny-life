import { Box3, Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import manifest from './assets/blender-manifest.json';
import worldManifest from './assets/world-manifest.json';
import suppliedManifest from './assets/supplied-manifest.json';
import {downloadAsset} from './asset-download.js';

const templates = new Map();
const worldTemplates = new Map();
const suppliedTemplates = new Map();
const tintedMaterials = new Map();
const failures = new Map();
const worldFailures = new Map();
const suppliedFailures = new Map();
let loading;

export async function loadBlenderModels() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const loadCollection = (collection, target, errors) => collection.assets.map(async asset => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const url = `${import.meta.env.BASE_URL}${asset.file}?v=${asset.sha256.slice(0, 12)}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const gltf = await loader.parseAsync(buffer, '');
      const bounds = new Box3().setFromObject(gltf.scene);
      const [width, depth] = asset.footprint;
      if (bounds.isEmpty() || Math.abs(bounds.min.y) > 0.015 ||
          Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) > width / 2 + 0.03 ||
          Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) > depth / 2 + 0.03) {
        throw new Error('Model does not match its ground origin or footprint');
      }
      gltf.scene.traverse(node => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = !node.material?.name?.startsWith('Slate_roof');
      });
      target.set(asset.type, gltf.scene);
    } catch (error) {
      errors.set(asset.type, error.message);
      console.warn(`Blender asset ${asset.type} unavailable; using the built-in model.`, error.message);
    } finally {
      clearTimeout(timeout);
    }
  });
  loading = Promise.all([
    ...loadCollection(manifest, templates, failures),
    ...loadCollection(worldManifest, worldTemplates, worldFailures),
    loadSuppliedModels(loader),
  ]).then(() => blenderAssetStatus());
  return loading;
}

async function loadSuppliedModels(loader) {
  try {
    const compressed=typeof DecompressionStream!=='undefined';
    const file=compressed?suppliedManifest.compressedFile:suppliedManifest.file;
    const hash=compressed?suppliedManifest.compressedSha256:suppliedManifest.sha256;
    let buffer=await downloadAsset(`${import.meta.env.BASE_URL}${file}?v=${hash.slice(0,12)}`,{
      expectedBytes:compressed?suppliedManifest.compressedBytes:suppliedManifest.bytes,decodedBytes:suppliedManifest.bytes,
    });
    const signature=new Uint8Array(buffer,0,Math.min(2,buffer.byteLength));
    if(compressed&&signature[0]===0x1f&&signature[1]===0x8b)
      buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const gltf=await loader.parseAsync(buffer,'');
    for(const asset of suppliedManifest.assets) {
      const template=gltf.scene.getObjectByName(asset.node);
      if(!template)throw new Error(`Missing supplied model: ${asset.type}`);
      const bounds=new Box3().setFromObject(template),[width,depth]=asset.footprint;
      if(bounds.isEmpty()||asset.grounded&&Math.abs(bounds.min.y)>.015||
        Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))>width/2+.03||
        Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z))>depth/2+.03)
        throw new Error(`Supplied model footprint mismatch: ${asset.type}`);
      suppliedTemplates.set(asset.type,template);
    }
  } catch(error) {
    suppliedTemplates.clear();
    for(const asset of suppliedManifest.assets)suppliedFailures.set(asset.type,error.message);
    console.warn('Supplied models unavailable; using the built-in models.',error.message);
  }
}

function tint(material, color) {
  const primary = material.name.startsWith('Dye_Main_');
  const seam = material.name.startsWith('Dye_Seam_');
  if (!primary && !seam) return material;
  const key = `${material.uuid}:${color}`;
  if (!tintedMaterials.has(key)) {
    const instance = material.clone();
    instance.color.set(color);
    if (seam) instance.color.multiplyScalar(0.77);
    tintedMaterials.set(key, instance);
  }
  return tintedMaterials.get(key);
}

function cloneModel(template, type, color, source='blender') {
  if (!template) return null;
  const model = new Group();
  model.name = `${source==='blender'?'Blender':'Supplied'}_${type}`;
  model.userData = { type, source, asset: source==='supplied'?suppliedManifest.file:`${type}.glb` };
  const instance = template.clone(true);
  template.updateWorldMatrix(true,false);
  instance.matrix.copy(template.matrixWorld);
  instance.matrix.decompose(instance.position,instance.quaternion,instance.scale);
  instance.traverse(node => {
    if(node.userData.part)node.name=node.userData.part;
    if (!node.isMesh) return;
    if(source==='supplied'){node.castShadow=true;node.receiveShadow=true;}
    if(color)node.material = Array.isArray(node.material) ? node.material.map(m => tint(m, color)) : tint(node.material, color);
  });
  model.add(instance);
  return model;
}

export function createBlenderFurniture(type, color) {
  if(suppliedTemplates.has(type))return cloneModel(suppliedTemplates.get(type),type,color,'supplied');
  return cloneModel(templates.get(type), type, color);
}

export function createSuppliedMarker() {
  return cloneModel(suppliedTemplates.get('plumbob'),'plumbob',null,'supplied');
}

export function createBlenderScenery(type, color) {
  return cloneModel(worldTemplates.get(type), type, color);
}

export function blenderAssetStatus() {
  return {
    generator: manifest.generator,
    loaded: [...templates.keys()],
    failed: Object.fromEntries(failures),
    total: manifest.assets.length,
    supplied:{loaded:[...suppliedTemplates.keys()],failed:Object.fromEntries(suppliedFailures),total:suppliedManifest.assets.length},
    scenery: {
      loaded: [...worldTemplates.keys()],
      failed: Object.fromEntries(worldFailures),
      total: worldManifest.assets.length,
    },
  };
}
