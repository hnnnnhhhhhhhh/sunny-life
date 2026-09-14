import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {newApartmentGame,navigationGrid} from '../src/game.js';
import {leisureCandidates,idleWalkPlan,Autonomy} from '../src/autonomy.js';
import {TRAFFIC,trafficState} from '../src/traffic.js';
import {readMusicSettings} from '../src/music.js';

test('traffic crosses in separate lanes with no overlapping visible vehicles',()=>{
  let appeared=0,emptyFrames=0;
  for(let time=0;time<210;time+=.25){
    const visible=TRAFFIC.types.map((_,index)=>trafficState(time,index)).filter(car=>car.visible);
    if(!visible.length)emptyFrames++;
    appeared+=visible.length;
    for(const car of visible){
      assert.ok(car.x>=TRAFFIC.minX&&car.x<=TRAFFIC.maxX);
      assert.ok(TRAFFIC.lanes.includes(car.z));
    }
    for(const a of visible)for(const b of visible)
      if(a!==b&&a.z===b.z)assert.ok(Math.abs(a.x-b.x)>8);
  }
  assert.ok(appeared>0);assert.ok(emptyFrames>0);
  assert.equal(trafficState(1,1).visible,false);
});

test('healthy residents choose reachable varied leisure without eating or hygiene spam',()=>{
  const game=newApartmentGame();for(const need in game.sim.needs)game.sim.needs[need]=95;
  const grid=navigationGrid(game.home),candidates=leisureCandidates(game,game.sim,grid);
  assert.ok(candidates.length>1);
  assert.ok(candidates.every(c=>['rest','watch','onlineChat'].includes(c.type)&&!c.plan.error));
  const next=leisureCandidates(game,game.sim,grid,candidates[0].id)[0];
  assert.notEqual(next.id,candidates[0].id);
  const walk=idleWalkPlan(game,game.sim,grid);
  assert.ok(walk?.path.length>1);
});

test('idle walking cannot invent paths in a blocked home and manual input cancels auto walks',()=>{
  const game=newApartmentGame();game.home.furniture=[];
  const grid=navigationGrid(game.home);
  const from={x:0,z:0},walk=idleWalkPlan(game,from,grid);
  assert.ok(walk);
  const world={path:walk.path,destination:{visible:true},emit(){}};
  const autonomy=new Autonomy(world);autonomy.walking=true;autonomy.manual();
  assert.deepEqual(world.path,[]);assert.equal(autonomy.walking,false);
  assert.equal(autonomy.cooldown,12);
  for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++)grid.setWalkableAt(x,y,false);
  assert.equal(idleWalkPlan(game,from,grid),null);
});

test('music preferences reject malformed values and clamp volume',()=>{
  const storage=value=>({getItem:()=>value});
  assert.deepEqual(readMusicSettings(storage('broken')),{enabled:false,volume:.35});
  assert.deepEqual(readMusicSettings(storage('{"enabled":true,"volume":2}')),{enabled:true,volume:1});
  assert.deepEqual(readMusicSettings(storage('{"enabled":"yes","volume":-1}')),{enabled:false,volume:0});
});

test('downloaded neighborhood bundle is compact, reproducible and attributed',async()=>{
  const info=JSON.parse(await readFile('src/assets/neighborhood-manifest.json','utf8'));
  const bytes=await readFile(`public/${info.file}`),compressed=await readFile(`public/${info.compressedFile}`);
  const hash=data=>createHash('sha256').update(data).digest('hex');
  assert.equal(hash(bytes),info.sha256);assert.equal(hash(compressed),info.compressedSha256);
  assert.deepEqual(gunzipSync(compressed),bytes);
  assert.ok(compressed.length<700000);
  assert.deepEqual(info.assets.map(a=>a.type),['sofa','curtains','sedan','taxi','van']);
  const sofa=info.assets[0];
  assert.ok(sofa.bounds.max[0]<=1.5&&sofa.bounds.min[0]>=-1.5);
  assert.ok(sofa.bounds.max[2]<=.575&&sofa.bounds.min[2]>=-.575);
  const license=await readFile('public/models/neighborhood/LICENSE.txt','utf8');
  for(const name of ['Wayfair','Eric Chadwick','Quaternius','Kenney'])assert.ok(license.includes(name));
  const sources=JSON.parse(await readFile('art/vendor/neighborhood/sources.json','utf8'));
  for(const source of sources)assert.equal(hash(await readFile(`art/vendor/neighborhood/${source.file}`)),source.sha256);
});
