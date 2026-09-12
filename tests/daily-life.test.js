import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,advanceSim,GAME_MINUTES_PER_SECOND,navigationGrid,activityTypes} from '../src/game.js';
import {planActivity,planSleep,localPoint} from '../src/interactions.js';
import {bedPoseAt,BED_TIMING} from '../src/bed-motion.js';
import {ActionQueue} from '../src/action-queue.js';

test('needs use game minutes: five hours of hunger and one day of hygiene',()=>{
  const sim={...newGame().sim,time:600,needs:{hunger:100,hygiene:100}};
  const five=advanceSim(sim,300),day=advanceSim(sim,1440);
  assert.equal(five.time,900);assert.equal(five.needs.hunger,50);
  assert.equal(day.needs.hygiene,70);assert.equal(day.day,sim.day+1);
  assert.equal(GAME_MINUTES_PER_SECOND,.5);
  let split=sim;
  for(let i=0;i<1440;i++)split=advanceSim(split,1);
  for(const key of Object.keys(day.needs))assert.ok(Math.abs(split.needs[key]-day.needs[key])<1e-8);
  for(const bad of [0,-1,Infinity,NaN])assert.equal(advanceSim(sim,bad),sim);
  assert.equal(sim.needs.hunger,100);
});

test('kitchen supports two validated activities and a reachable handwashing position',()=>{
  const game=newGame(),grid=navigationGrid(game.home),kitchen=game.home.furniture.find(f=>f.type==='kitchen');
  assert.deepEqual(activityTypes('kitchen'),['eat','washHands']);
  const wash=planActivity(game.home,kitchen,game.sim,grid,1,'washHands');
  assert.equal(wash.error,undefined);
  assert.deepEqual(wash.stand,localPoint(kitchen,-1.13,.73));
  const bed=game.home.furniture.find(f=>f.type==='bed');
  assert.ok(planActivity(game.home,bed,game.sim,grid,1,'washHands').error);
  for(const rotation of [0,Math.PI/2,Math.PI,3*Math.PI/2]) {
    const sink={id:'sink',type:'sink',x:0,z:0,rotation,color:'#bfd0c8'};
    const home={...game.home,walls:[],furniture:[sink]};
    assert.equal(planActivity(home,sink,{x:3,z:3},navigationGrid(home),1,'washHands').error,undefined);
    home.furniture.push({id:'block',type:'sofa',...localPoint(sink,0,.9),rotation,color:'#abc'});
    assert.ok(planActivity(home,sink,{x:3,z:3},navigationGrid(home),1,'washHands').error);
  }
});

test('optional activities retain their label and type through the queue',()=>{
  let started;
  const world={state:{mode:'live',speed:0,game:newGame()},path:[],emit(){},autonomy:{manual(){}},
    activities:{current:null,start(id,recipe,options){started={id,options};return true;}}};
  const queue=new ActionQueue(world);
  assert.equal(queue.add({kind:'furniture',targetId:'bed-1',activity:'washHands'}),false);
  assert.equal(queue.add({kind:'furniture',targetId:'kitchen-1',activity:'washHands'}),true);
  assert.equal(queue.items[0].label,'洗手');
  world.state.speed=1;queue.update();
  assert.equal(started.options.activity,'washHands');
});

test('bed timeline has continuous contact positions and reversible intermediate poses',()=>{
  const game=newGame(),bed=game.home.furniture.find(f=>f.type==='bed');
  for(const height of [.85,1,1.15]) {
    const plan=planSleep(game.home,bed,game.sim,navigationGrid(game.home),height);
    assert.equal(plan.error,undefined);
    let previous=bedPoseAt(0,plan,height);
    for(let frame=1;frame<=300;frame++) {
      const time=frame/60,pose=bedPoseAt(time,plan,height),exit=bedPoseAt(time,plan,height,true);
      assert.deepEqual(pose.hip,exit.hip);
      assert.ok(Math.hypot(...['x','y','z'].map(k=>pose.hip[k]-previous.hip[k]))<.04);
      assert.ok(Math.abs(pose.recline-previous.recline)<.02);
      previous=pose;
    }
    assert.equal(bedPoseAt(BED_TIMING.total,plan,height).recline,1);
    assert.equal(bedPoseAt(BED_TIMING.sit,plan,height).legs,0);
    assert.equal(bedPoseAt(0,plan,height).hip.y,plan.floor+1.08*height);
  }
});
