import {NodeIO,PropertyType} from '@gltf-transform/core';
import {dedup} from '@gltf-transform/functions';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function optimizeResident(root=fileURLToPath(new URL('..',import.meta.url))) {
  const path=resolve(root,'src/assets/resident-manifest.json');
  const manifest=JSON.parse(await readFile(path,'utf8'));
  const file=resolve(root,'public',manifest.file),io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc=await io.read(file);
  await doc.transform(dedup({propertyTypes:[PropertyType.TEXTURE]}));
  const bytes=await io.writeBinary(doc);
  const compressed=gzipSync(bytes,{level:9});
  const hash=data=>createHash('sha256').update(data).digest('hex');
  await writeFile(file,bytes);
  await writeFile(`${file}.gz`,compressed);
  Object.assign(manifest,{bytes:bytes.length,sha256:hash(bytes),
    compressedFile:`${manifest.file}.gz`,compressedBytes:compressed.length,compressedSha256:hash(compressed)});
  await writeFile(path,`${JSON.stringify(manifest,null,2)}\n`);
  console.log(JSON.stringify({residentBytes:bytes.length,compressedBytes:compressed.length,textures:doc.getRoot().listTextures().length}));
}

if(process.argv[1]===fileURLToPath(import.meta.url))await optimizeResident();
