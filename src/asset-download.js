export async function downloadAsset(url,{onProgress,expectedBytes=0,decodedBytes=expectedBytes,idleMs=15000,totalMs=180000}={}) {
  const controller=new AbortController();
  let idle;
  const resetIdle=()=>{
    clearTimeout(idle);
    idle=setTimeout(()=>controller.abort(),idleMs);
  };
  const limit=setTimeout(()=>controller.abort(),totalMs);
  resetIdle();
  try {
    const response=await fetch(url,{signal:controller.signal,priority:'high'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    resetIdle();
    if(!response.body)return await response.arrayBuffer();
    const total=response.headers.get('content-encoding')?decodedBytes:Number(response.headers.get('content-length'))||expectedBytes;
    const reader=response.body.getReader(),chunks=[];
    let loaded=0;
    while(true) {
      const {value,done}=await reader.read();
      if(done)break;
      chunks.push(value);loaded+=value.length;resetIdle();
      onProgress?.(loaded,total);
    }
    const result=new Uint8Array(loaded);
    let offset=0;
    for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
    return result.buffer;
  } catch(error) {
    controller.abort();
    throw error;
  } finally {
    clearTimeout(idle);clearTimeout(limit);
  }
}
