import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {unzipSync} from 'three/addons/libs/fflate.module.js';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,textureCompress,getBounds} from '@gltf-transform/functions';
import sharp from 'sharp';

const root=fileURLToPath(new URL('..',import.meta.url)),vendor=resolve(root,'art/vendor/neighborhood');
await mkdir(vendor,{recursive:true});
const sources=[
  {file:'sofa.glb',cache:'glam-sofa.glb',url:'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/GlamVelvetSofa/glTF-Binary/GlamVelvetSofa.glb',
    author:'Eric Chadwick / Wayfair LLC',license:'CC-BY-4.0'},
  {file:'curtains.glb',cache:'quaternius-curtains.glb',url:'https://static.poly.pizza/cf707f1b-8d82-467d-b89e-e4c1322f4515.glb',
    page:'https://poly.pizza/m/kkeII96j9N',author:'Quaternius',license:'CC0-1.0'},
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function download(url,path){
  const result=spawnSync('curl',['--fail','--silent','--show-error','--location','--retry','2','--max-time','240',url,'--output',path],{stdio:'inherit'});
  if(result.status!==0)throw new Error(`Download failed: ${url}`);
}
for(const source of sources){
  const file=resolve(vendor,source.file);
  if(!existsSync(file)){
    const cache=resolve(root,'.runtime',source.cache);
    if(!existsSync(cache))download(source.url,cache);
    await writeFile(file,await readFile(cache));
  }
  const bytes=await readFile(file);
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(8)!==bytes.length)throw new Error(`Incomplete GLB: ${file}`);
  source.sha256=hash(bytes);
}
const carUrl='https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip';
const zipPath=resolve(root,'.runtime/kenney-car-kit.zip');
if(!existsSync(zipPath))download(carUrl,zipPath);
const zip=unzipSync(await readFile(zipPath));
await mkdir(resolve(vendor,'Textures'),{recursive:true});
await writeFile(resolve(vendor,'Textures/colormap.png'),zip['Models/GLB format/Textures/colormap.png']);
for(const name of ['sedan','taxi','van']){
  const entry=`Models/GLB format/${name}.glb`,bytes=zip[entry];
  if(!bytes)throw new Error(`Vehicle missing: ${name}`);
  await writeFile(resolve(vendor,`${name}.glb`),bytes);
  sources.push({file:`${name}.glb`,url:carUrl,entry,author:'Kenney',license:'CC0-1.0',sha256:hash(bytes)});
}
await writeFile(resolve(vendor,'sources.json'),`${JSON.stringify(sources,null,2)}\n`);
await writeFile(resolve(vendor,'Kenney-License.txt'),zip['License.txt']);
const blender=process.env.BLENDER_BIN||resolve(root,'.runtime/Blender.app/Contents/MacOS/Blender');
const result=spawnSync(blender,['--background','--python-exit-code','1','--python',resolve(root,'art/blender/build_neighborhood.py')],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const file=resolve(root,'public/models/neighborhood/neighborhood.glb'),doc=await io.read(file);
await doc.transform(dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:92}));
const data=await io.writeBinary(doc),compressed=gzipSync(data,{level:9});
await writeFile(file,data);await writeFile(`${file}.gz`,compressed);
const assets=['sofa','curtains','sedan','taxi','van'].map(type=>{
  const node=doc.getRoot().listNodes().find(n=>n.getName()===`Neighborhood_${type}`);
  let triangles=0;node.traverse(n=>{for(const p of n.getMesh()?.listPrimitives()||[])triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;});
  return {type,node:node.getName(),bounds:getBounds(node),triangles};
});
const manifest={file:'models/neighborhood/neighborhood.glb',compressedFile:'models/neighborhood/neighborhood.glb.gz',
  bytes:data.length,compressedBytes:compressed.length,sha256:hash(data),compressedSha256:hash(compressed),assets};
await writeFile(resolve(root,'src/assets/neighborhood-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
console.log(JSON.stringify(manifest));
