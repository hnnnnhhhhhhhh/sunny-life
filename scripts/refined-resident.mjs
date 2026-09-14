import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';

const root=fileURLToPath(new URL('..',import.meta.url));
const source=process.argv.find(a=>a.startsWith('--source='))?.slice(9);
if(!source)throw new Error('Pass --source=/absolute/path/to/mrs_afton.glb');
const blender=process.env.BLENDER_BIN||resolve(root,'.runtime/Blender.app/Contents/MacOS/Blender');
const output=resolve(root,'.runtime/refined-resident');
const result=spawnSync(blender,['--background','--python-exit-code','1','--python',
  resolve(root,'art/blender/build_refined_resident.py'),'--','--source',resolve(source),'--output',output],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),file=resolve(output,'resident.glb');
const doc=await io.read(file);
await doc.transform(dedup(),textureCompress({encoder:sharp,targetFormat:'webp',quality:92}));
const bytes=await io.writeBinary(doc),compressed=gzipSync(bytes,{level:9});
await writeFile(file,bytes);await writeFile(`${file}.gz`,compressed);
const manifest=JSON.parse(await readFile(resolve(output,'manifest.json'),'utf8'));
const hash=data=>createHash('sha256').update(data).digest('hex');
Object.assign(manifest,{bytes:bytes.length,sha256:hash(bytes),
  compressedFile:`${manifest.file}.gz`,compressedBytes:compressed.length,compressedSha256:hash(compressed)});
await writeFile(resolve(output,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
console.log(JSON.stringify({bytes:bytes.length,compressedBytes:compressed.length,url:'http://localhost:5186/?resident=refined'}));
