import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionQueue } from '../src/action-queue.js';
import { ActivityRunner } from '../src/activity-runner.js';
import { FISHING_SPOTS, planFishing } from '../src/fishing.js';
import { loadGame, migrateGame, navigationGrid, NEED_DECAY, newGame, validateSave } from '../src/game.js';
import { terrainSurface } from '../src/terrain.js';

function mockWorld() {
  const events=[], started=[];
  const world={
    state:{mode:'live',speed:1,game:newGame()},path:[],npcs:[],
    autonomy:{manual(){}},emit:event=>events.push(event),
    activities:{current:{type:'watch'},start(id){started.push(id);this.current={type:id};return true;}},
  };
  world.queue=new ActionQueue(world);
  return {world,events,started};
}

test('manual commands queue FIFO, respect pause, reorder and remove',()=>{
  const {world,started}=mockWorld();
  world.queue.add({kind:'furniture',targetId:'toilet-1'});
  world.queue.add({kind:'furniture',targetId:'bed-1'});
  assert.equal(started.length,0);
  world.queue.moveUp(world.queue.items[1].id);
  assert.equal(world.queue.items[0].targetId,'bed-1');
  world.queue.remove(world.queue.items[0].id);
  world.activities.current=null; world.state.speed=0; world.queue.update();
  assert.equal(started.length,0);
  world.state.speed=1; world.queue.update();
  assert.deepEqual(started,['toilet-1']);
  assert.equal(world.queue.items.length,0);
});

test('queue capacity is bounded and skips a missing target without stalling',()=>{
  const {world}=mockWorld();
  for(let i=0;i<10;i++)world.queue.add({kind:'furniture',targetId:'toilet-1'});
  assert.equal(world.queue.items.length,8);
  world.queue.clear();
  world.queue.add({kind:'furniture',targetId:'bed-1'});
  world.queue.add({kind:'furniture',targetId:'toilet-1'});
  const started=[];
  world.activities.start=id=>{started.push(id);return id==='toilet-1';};
  world.activities.current=null; world.queue.update();
  assert.deepEqual(started,['bed-1','toilet-1']);
  assert.equal(world.queue.items.length,0);
});

test('incremental benefit accounting is monotonic and does not reward twice',()=>{
  const events=[], runner=new ActivityRunner({emit:e=>events.push(e)});
  const action={type:'watch',progress:0.25};
  runner.creditProgress(action); runner.creditProgress(action);
  assert.equal(events.length,1); assert.equal(events[0].amount,6.5);
  action.progress=0.5; runner.creditProgress(action);
  action.progress=1; runner.creditProgress(action);
  assert.equal(events.reduce((sum,e)=>sum+e.amount,0),26);
  assert.equal(NEED_DECAY.hygiene,0.032);
});

test('all fishing spots have exact reachable ground and cast into actual water',()=>{
  const g=newGame(),grid=navigationGrid(g.home);
  for(const s of FISHING_SPOTS) {
    const plan=planFishing(g.home,s.id,g.sim,grid);
    assert.equal(plan.error,undefined);
    assert.ok(Math.hypot(plan.approach.x-s.x,plan.approach.z-s.z)<0.55);
    assert.notEqual(terrainSurface(plan.approach.x,plan.approach.z).kind,'water');
    assert.equal(terrainSurface(s.water.x,s.water.z).kind,'water');
  }
});

test('new visitors require creation but legacy residents and catches round-trip',()=>{
  assert.equal(loadGame({getItem:()=>null}).data.onboarding,false);
  const old=newGame(); delete old.onboarding; delete old.sim.catches;
  assert.equal(migrateGame(old).onboarding,true);
  assert.deepEqual(migrateGame(old).sim.catches,[]);
  const g=newGame(); g.sim.catches=[{type:'silver',day:1}];
  assert.equal(validateSave(g),true);
  g.sim.catches[0].type='unknown'; assert.equal(validateSave(g),false);
});
