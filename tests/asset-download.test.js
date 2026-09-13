import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {downloadAsset} from '../src/asset-download.js';
import {gzipSync} from 'node:zlib';

async function serverFor(handler,run) {
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {await run(`http://127.0.0.1:${server.address().port}`);}
  finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('active downloads outlive the inactivity window and report monotonic progress',async()=>{
  await serverFor((req,res)=>{
    res.writeHead(200,{'content-length':'8'});res.flushHeaders();
    let index=0;
    const timer=setInterval(()=>{
      res.write('resident'[index++]);
      if(index===8){clearInterval(timer);res.end();}
    },100);
    res.on('close',()=>clearInterval(timer));
  },async url=>{
    const progress=[];
    const bytes=await downloadAsset(url,{idleMs:350,totalMs:4000,onProgress:(loaded,total)=>progress.push([loaded,total])});
    assert.equal(new TextDecoder().decode(bytes),'resident');
    assert.deepEqual(progress.at(-1),[8,8]);
    for(let i=1;i<progress.length;i++)assert.ok(progress[i][0]>progress[i-1][0]);
  });
});

test('stalled and endless responses are aborted with bounded resources',async()=>{
  for(const endless of [false,true])await serverFor((req,res)=>{
    res.writeHead(200);res.write('a');
    const timer=endless?setInterval(()=>res.write('a'),80):null;
    res.on('close',()=>clearInterval(timer));
  },async url=>{
    await assert.rejects(downloadAsset(url,{idleMs:350,totalMs:800}),error=>error.name==='AbortError');
  });
});

test('HTTP compression reports progress against decoded bytes',async()=>{
  const raw=Buffer.from('resident'),compressed=gzipSync(raw);
  await serverFor((req,res)=>{
    res.writeHead(200,{'content-encoding':'gzip','content-length':String(compressed.length)});
    res.end(compressed);
  },async url=>{
    let progress;
    const bytes=await downloadAsset(url,{expectedBytes:compressed.length,decodedBytes:raw.length,onProgress:(...p)=>{progress=p;}});
    assert.deepEqual(Buffer.from(bytes),raw);
    assert.deepEqual(progress,[raw.length,raw.length]);
  });
});
