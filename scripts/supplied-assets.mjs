import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {metalRough,dedup,prune,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';

const project=fileURLToPath(new URL('..',import.meta.url));
const input=resolve(project,'.runtime/supplied-input');
const source=resolve(project,'art/blender/sunny-supplied.blend');
const rebuild=process.argv.includes('--rebuild');
const sourceDir=process.argv.find(arg=>arg.startsWith('--source-dir='))?.slice(13);
const catalog=JSON.parse(await readFile(resolve(project,'art/vendor/supplied/sources.json'),'utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
if(rebuild) {
  if(!sourceDir)throw new Error('Pass --source-dir=/path/to/downloaded/models when rebuilding.');
  const files=[];
  async function scan(dir) {
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      const path=join(dir,entry.name);
      if(entry.isDirectory())await scan(path);
      else if(entry.isFile()&&entry.name.endsWith('.glb'))files.push(path);
    }
  }
  await scan(resolve(sourceDir));
  await mkdir(input,{recursive:true});
  for(const [id,info] of Object.entries(catalog)) {
    let bytes;
    for(const path of files.filter(path=>path.endsWith(`/${info.filename}`))) {
      const candidate=await readFile(path);
      if(createHash('sha256').update(candidate).digest('hex')===info.sha256){bytes=candidate;break;}
    }
    if(!bytes)throw new Error(`Missing verified source model: ${info.filename}`);
    const doc=await io.readBinary(bytes);
    if(id==='toilet')for(const node of doc.getRoot().listNodes())
      if(node.getMesh())node.getMesh().setName(node.getName());
    if(id==='kitchen') {
      await doc.transform(metalRough());
      for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()) {
        const weights=p.getAttribute('WEIGHTS_0'),joints=p.getAttribute('JOINTS_0');
        if(!weights||!joints)continue;
        for(let i=0;i<weights.getCount();i++) {
          const values=weights.getElement(i,[]);
          if(values.reduce((n,v)=>n+v,0)===0){weights.setElement(i,[1,0,0,0]);joints.setElement(i,[0,0,0,0]);}
        }
      }
    }
    await io.write(resolve(input,`${id}.glb`),doc);
  }
} else if(!existsSync(source))throw new Error('No edited .blend exists. Rebuild with the source models first.');
const candidates=[process.env.BLENDER_BIN,resolve(project,'.runtime/Blender.app/Contents/MacOS/Blender'),'/Applications/Blender.app/Contents/MacOS/Blender','blender'].filter(Boolean);
const blender=candidates.find(bin=>spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);
if(!blender)throw new Error('Blender is required to export the supplied models.');
const args=['--background',...(!rebuild?[source]:[]),'--python-exit-code','1','--python',
  resolve(project,'art/blender/build_supplied.py'),'--',...(!rebuild?['--export-only']:[])];
const result=spawnSync(blender,args,{cwd:project,stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
const manifestPath=resolve(project,'src/assets/supplied-manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const destination=resolve(project,'public',manifest.file);
const document=await io.read(destination);
await document.transform(dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',quality:92,resize:[512,512]}));
for(const asset of manifest.assets) {
  const node=document.getRoot().listNodes().find(n=>n.getName()===asset.node);
  let triangles=0;
  const visit=node=>{
    for(const p of node.getMesh()?.listPrimitives()||[])triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
    for(const child of node.listChildren())visit(child);
  };
  visit(node);
  asset.triangles=triangles;
}
const raw=Buffer.from(await io.writeBinary(document)),compressed=gzipSync(raw,{level:9});
await writeFile(destination,raw);
await writeFile(`${destination}.gz`,compressed);
Object.assign(manifest,{bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),
  compressedFile:`${manifest.file}.gz`,compressedBytes:compressed.length,
  compressedSha256:createHash('sha256').update(compressed).digest('hex')});
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({bytes:raw.length,compressedBytes:compressed.length,models:manifest.assets.map(a=>a.type)}));
