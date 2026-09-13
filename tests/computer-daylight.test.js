import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newApartmentGame,newGame,navigationGrid,activityTypes,migrateGame} from '../src/game.js';
import {planComputer,localPoint} from '../src/interactions.js';
import {autonomousCandidates} from '../src/autonomy.js';
import {ActionQueue} from '../src/action-queue.js';
import {daylightAt} from '../src/daylight.js';

test('daylight is continuous at midnight and every lighting keyframe',()=>{
  assert.equal(daylightAt(0).sky.getHex(),daylightAt(1440).sky.getHex());
  for(const time of [0,300,360,450,720,1020,1110,1170,1230,1440]) {
    const a=daylightAt(time-.001),b=daylightAt(time+.001);
    assert.ok(Math.abs(a.sun-b.sun)<.001);
    assert.ok(Math.abs(a.ambient-b.ambient)<.001);
    assert.ok(Math.abs(a.lamps-b.lamps)<.001);
    for(const key of ['r','g','b'])assert.ok(Math.abs(a.sky[key]-b.sky[key])<.001);
  }
  assert.equal(daylightAt(720).lamps,0);
  assert.equal(daylightAt(1320).lamps,1);
  assert.ok(daylightAt(1320).sun<daylightAt(720).sun/5);
});

test('computer supports optional reading, rotated seat access and rejects blocked chairs',()=>{
  assert.deepEqual(activityTypes('desk'),['onlineChat','read']);
  const game=newApartmentGame(),desk=game.home.furniture.find(f=>f.type==='desk');
  assert.equal(planComputer(game.home,desk,game.sim,navigationGrid(game.home)).error,undefined);
  for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
    const object={...desk,x:0,z:0,rotation},home={...newGame().home,walls:[],furniture:[object]};
    const plan=planComputer(home,object,{x:3,z:3},navigationGrid(home));
    assert.equal(plan.error,undefined);
    assert.deepEqual(plan.seat,localPoint(object,0,.49));
    home.furniture.push({id:'block',type:'sofa',...localPoint(object,0,.6),rotation,color:'#ffffff'});
    assert.ok(planComputer(home,object,{x:3,z:3},navigationGrid(home)).error);
  }
});

test('apartment social autonomy selects a real computer, never a hidden neighbor',()=>{
  const game=newApartmentGame();game.sim.needs.social=5;
  const neighbors=[{id:'neighbor-1',mesh:{position:{x:7.25,z:0}},busy:false}];
  const candidates=autonomousCandidates(game,game.sim,navigationGrid(game.home),neighbors);
  assert.equal(candidates[0].type,'onlineChat');
  assert.equal(candidates[0].id,'desk-1');
  assert.equal(candidates.some(c=>c.type==='chat'),false);
  game.home.furniture=game.home.furniture.filter(f=>f.type!=='desk');
  assert.equal(autonomousCandidates(game,game.sim,navigationGrid(game.home),neighbors).some(c=>c.type==='chat'),false);
  const legacy=structuredClone(game);
  assert.deepEqual(migrateGame(legacy).home,legacy.home,'do not replace the saved decoration to install a computer');
});

test('queue rejects apartment physical chat and forwards computer activity in FIFO order',()=>{
  const calls=[],world={state:{mode:'live',speed:0,game:newApartmentGame()},path:[],
    npcs:[{id:'neighbor-1',data:{name:'Friend'}}],autonomy:{manual(){}},emit(){},
    activities:{current:null,start(id,recipe,options){calls.push({id,...options});this.current={};return true;}}};
  const queue=new ActionQueue(world);
  assert.equal(queue.add({kind:'chat',targetId:'neighbor-1'}),false);
  assert.equal(queue.add({kind:'furniture',targetId:'desk-1',activity:'onlineChat'}),true);
  assert.equal(queue.add({kind:'furniture',targetId:'toilet-1'}),true);
  world.state.speed=1;queue.update();
  assert.equal(calls[0].activity,'onlineChat');
  queue.update();assert.equal(calls.length,1);
  world.activities.current=null;queue.update();
  assert.equal(calls[1].id,'toilet-1');
});
