import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,textureCompress,join,flatten,getBounds} from '@gltf-transform/functions';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import sharp from 'sharp';
import {Matrix4,Vector3,Triangle} from 'three';
const source=process.argv.find(v=>v.startsWith('--source='))?.slice(9);
if(!source)throw new Error('Pass --source=/absolute/path/to/isometric_office.glb');
const original=await readFile(source),io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(source);
const metadata=doc.getRoot().getAsset().extras;
await mkdir('public/models/office',{recursive:true});
await mkdir('art/vendor/office',{recursive:true});
const report=doc.getRoot().listNodes().filter(n=>!/Object_|GLTF|Sketchfab|^root$/.test(n.getName()))
  .map(n=>({name:n.getName(),parent:n.getParentNode()?.getName(),...getBounds(n)}));
await writeFile('.runtime/office-inventory.json',JSON.stringify(report,null,2));
await doc.transform(dedup(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:90}));
if(!process.argv.includes('--preview')){
  const target=doc.getRoot().listNodes().find(n=>n.getName()==='Desk.002_257');
  if(target){const nodes=[];target.traverse(n=>nodes.push(n));for(const n of nodes.reverse())n.dispose();}
  const step=.2,minX=-6.6,minZ=-6.6,width=86,height=67,cells=new Uint8Array(width*height);
  const a=new Vector3(),b=new Vector3(),c=new Vector3(),point=new Vector3(),closest=new Vector3(),triangle=new Triangle();
  for(const node of doc.getRoot().listNodes()){
    if(!node.getMesh())continue;
    const matrix=new Matrix4().fromArray(node.getWorldMatrix());
    for(const primitive of node.getMesh().listPrimitives()){
      const position=primitive.getAttribute('POSITION'),index=primitive.getIndices();
      const count=index?.getCount()||position.getCount();
      for(let i=0;i<count;i+=3){
        for(const [offset,v] of [a,b,c].entries()){
          v.fromArray(position.getElement(index?index.getScalar(i+offset):i+offset,[])).applyMatrix4(matrix);
          v.set((v.x+5)*1.3,(v.y+.01410386)*1.3,(v.z-5)*1.3);
        }
        if(Math.max(a.y,b.y,c.y)<.16||Math.min(a.y,b.y,c.y)>1.9)continue;
        a.y=b.y=c.y=0;triangle.set(a,b,c);
        const x1=Math.max(0,Math.floor((Math.min(a.x,b.x,c.x)-.19-minX)/step)),x2=Math.min(width-1,Math.ceil((Math.max(a.x,b.x,c.x)+.19-minX)/step));
        const z1=Math.max(0,Math.floor((Math.min(a.z,b.z,c.z)-.19-minZ)/step)),z2=Math.min(height-1,Math.ceil((Math.max(a.z,b.z,c.z)+.19-minZ)/step));
        for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++){
          const k=z*width+x;if(cells[k])continue;
          point.set(minX+x*step,0,minZ+z*step);triangle.closestPointToPoint(point,closest);
          if(point.distanceTo(closest)<.19)cells[k]=1;
        }
      }
    }
  }
  await writeFile('src/assets/office-navigation.json',JSON.stringify({step,minX,minZ,width,height,blocked:Array.from(cells)})+'\n');
  await doc.transform(flatten(),join(),prune());
}
const bytes=await io.writeBinary(doc),compressed=gzipSync(bytes,{level:9});
await writeFile('public/models/office/office.glb',bytes);await writeFile('public/models/office/office.glb.gz',compressed);
const hash=v=>createHash('sha256').update(v).digest('hex');
const manifest={file:'models/office/office.glb',compressedFile:'models/office/office.glb.gz',
  bytes:bytes.length,compressedBytes:compressed.length,sha256:hash(bytes),compressedSha256:hash(compressed),
  sourceSha256:hash(original),source:metadata,bounds:getBounds(doc.getRoot().listScenes()[0])};
await writeFile('src/assets/office-manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('art/vendor/office/source.json',JSON.stringify({sha256:hash(original),...metadata},null,2)+'\n');
console.log(manifest);
