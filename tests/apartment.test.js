import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,newApartmentGame,switchResidence,validateSave,validatePlacement,validateResize,validateWall,
  createRoom,migrateGame,loadGame,SAVE_KEY,navigationGrid,findPath,ITEM_MAP} from '../src/game.js';
import {planActivity,planChat} from '../src/interactions.js';
import {removeWall,setWallOpening,floorRegions} from '../src/architecture.js';
import {apartmentWalkable} from '../src/residence.js';

test('new visitors begin in an apartment while old coastal homes remain intact',()=>{
  assert.equal(loadGame({getItem:()=>null}).data.home.residence,'apartment');
  const old=newGame();
  assert.deepEqual(loadGame({getItem:()=>JSON.stringify(old)}).data.home,old.home);
  assert.equal(validateSave(newApartmentGame()),true);
});

test('all apartment furniture fits and every activity has a physical reachable plan',()=>{
  const g=newApartmentGame(),grid=navigationGrid(g.home);
  for(const f of g.home.furniture) {
    assert.equal(validatePlacement(g.home,f,f.id),null,f.id);
    if(ITEM_MAP[f.type].activity)assert.equal(planActivity(g.home,f,g.sim,grid).error,undefined,f.id);
  }
  const kitchen=g.home.furniture.find(f=>f.type==='kitchen');
  assert.equal(planActivity(g.home,kitchen,g.sim,grid,1,'washHands').error,undefined);
  assert.equal(planChat(g.home,{x:7.25,z:-2.6},g.sim,grid).error,undefined);
  for(const to of [{x:0,z:5.5},{x:7.25,z:-1.5}]) {
    const path=findPath(g.home,g.sim,to,grid);
    assert.ok(path.length);
    for(const p of path)assert.ok(apartmentWalkable(p.x,p.z));
  }
  assert.deepEqual(findPath(g.home,g.sim,{x:0,z:9},grid),[]);
});

test('moving preserves both decorated homes, budgets and resident needs across save reload',()=>{
  const coast=newGame();coast.home.furniture[0].color='#abcdef';coast.budget=12345;coast.sim.needs.hunger=42;
  const apartment=switchResidence(coast,'apartment');
  apartment.home.furniture[0].color='#123456';apartment.budget=10000;
  assert.equal(validateSave(apartment),true);
  const reloaded=loadGame({getItem:key=>key===SAVE_KEY?JSON.stringify(apartment):null}).data;
  const restored=switchResidence(reloaded,'coastal');
  assert.deepEqual(restored.home,coast.home);assert.equal(restored.budget,12345);
  assert.equal(restored.sim.needs.hunger,42);
  const returned=switchResidence(restored,'apartment');
  assert.equal(returned.home.furniture[0].color,'#123456');assert.equal(returned.budget,10000);
  assert.equal(returned.sim.day,coast.sim.day);
  const bad=structuredClone(returned);bad.residenceBackup.budget=-1;
  assert.equal(validateSave(bad),false);
  bad.residenceBackup={};assert.equal(validateSave(bad),false);
});

test('apartment shell and corridor are protected while internal partitions remain editable',()=>{
  const g=newApartmentGame(),h=g.home;
  assert.equal(removeWall(h,'exterior-west'),h);
  assert.ok(setWallOpening(h,'exterior-west','door',{x:-6,z:0}).error);
  assert.equal(removeWall(h,'bedroom-divider').walls.length,h.walls.length-1);
  assert.equal(typeof validateResize(h,14,10),'string');
  assert.ok(createRoom(h,{x1:7,x2:9,z1:1,z2:4}).error);
  assert.ok(validateWall(h,{x1:8,z1:0,x2:8,z2:2}));
  assert.ok(validatePlacement(h,{id:'extra',type:'plant',x:7.2,z:0,rotation:0,color:'#ffffff'}));
  assert.equal(floorRegions(h).length,3);
  const misplaced={...g,sim:{...g.sim,x:20,z:20}};
  assert.equal(migrateGame(misplaced).sim.x,0);
  assert.deepEqual(migrateGame(misplaced).home,h);
});
