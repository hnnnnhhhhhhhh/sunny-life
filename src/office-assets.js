import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {downloadAsset} from './asset-download.js';
import manifest from './assets/office-manifest.json' with {type:'json'};
let asset,loading,error;
export async function loadOfficeAssets(onProgress){
  if(asset)return asset;
  if(loading)return loading;
  loading=(async()=>{
    try{
      const compressed=typeof DecompressionStream!=='undefined',file=compressed?manifest.compressedFile:manifest.file;
      let bytes=await downloadAsset(`${import.meta.env.BASE_URL}${file}?v=${manifest.sha256.slice(0,12)}`,{
        expectedBytes:compressed?manifest.compressedBytes:manifest.bytes,decodedBytes:manifest.bytes,idleMs:30000,onProgress});
      const signature=new Uint8Array(bytes,0,2);
      if(compressed&&signature[0]===31&&signature[1]===139)
        bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      asset=(await new GLTFLoader().parseAsync(bytes,'')).scene;error=null;return asset;
    }catch(e){error=e.message;loading=null;throw e;}
  })();
  return loading;
}
export function createOfficeAsset(){
  if(!asset)throw new Error('Office model must be loaded before entering.');
  const root=asset.clone(true);
  root.scale.setScalar(1.3);root.position.set(6.5,.25+.01410386*1.3,-6.5);
  root.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
  return root;
}
export const officeAssetStatus=()=>({loaded:!!asset,error,bytes:manifest.compressedBytes});
