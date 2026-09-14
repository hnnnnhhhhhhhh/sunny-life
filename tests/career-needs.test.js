import test from 'node:test';
import assert from 'node:assert/strict';
import {newApartmentGame,advanceGame,validateSave,migrateGame,advanceSim,NEED_DECAY} from '../src/game.js';
import {careerAction,departureError,refreshmentError} from '../src/career.js';
import {moodState,needLevel} from '../src/needs.js';
import {OFFICE,officeRoute} from '../src/office-layout.js';

function hired(){
  let g=newApartmentGame();g.sim.time=540;g.sim.autonomy=false;
  return careerAction(g,{kind:'hire',jobId:'assistant'});
}
test('bladder depletion fires once, resets bladder and drops hygiene to zero',()=>{
  const g=newApartmentGame();g.sim.needs.bladder=0;
  const a=advanceGame(g,.5);
  assert.equal(a.sim.wellbeing.accidents,1);assert.equal(a.sim.needs.hygiene,0);assert.equal(a.sim.needs.bladder,65);
  assert.equal(moodState(a).label,'窘迫');assert.equal(moodState(a).severity,'critical');
  const b=advanceGame(migrateGame(JSON.parse(JSON.stringify(a))),5);
  assert.equal(b.sim.wellbeing.accidents,1);assert.ok(validateSave(b));
  const safe=advanceGame(g,.5,{usingToilet:true});assert.equal(safe.sim.wellbeing.accidents,0);
});
test('healthy needs retain base decay; social personality magnifies sustained loneliness',()=>{
  const g=newApartmentGame(),base=advanceSim(g.sim,10),healthy=advanceGame(g,10);
  assert.ok(Math.abs(base.needs.hunger-healthy.sim.needs.hunger)<1e-8);
  g.sim.needs.social=0;g.sim.needs.fun=85;g.sim.needs.bladder=100;g.sim.needs.hunger=100;
  const ordinary=advanceGame(g,60);
  const social=advanceGame({...g,avatar:{...g.avatar,traits:['社交达人']}},60);
  assert.ok(social.sim.needs.fun<ordinary.sim.needs.fun-25);
  assert.equal(moodState(social).label,'渴望陪伴');
  assert.deepEqual([0,20,21,50,51,100].map(needLevel),['critical','critical','warning','warning','good','good']);
});
test('wellbeing migration and invalid event records are validated',()=>{
  const g=newApartmentGame();delete g.sim.wellbeing;delete g.career;
  assert.ok(validateSave(g));const next=migrateGame(g);assert.equal(next.sim.wellbeing.accidents,0);
  next.sim.wellbeing.lastAccident={at:999999,x:0,z:0};assert.equal(validateSave(next),false);
});
test('actual work time pays once and returning home preserves all decoration',()=>{
  let g=hired(),home=structuredClone(g.home),budget=g.budget;
  g=careerAction(g,{kind:'depart'});g=advanceGame(g,123);
  assert.equal(g.career.shift.worked,120);assert.ok(g.career.stress>0);
  g=careerAction(g,{kind:'leave'});assert.equal(g.budget,budget+80);
  g=careerAction(g,{kind:'leave'});assert.equal(g.budget,budget+80);
  g=advanceGame(migrateGame(JSON.parse(JSON.stringify(g))),5);
  assert.equal(g.career.location,'home');assert.deepEqual(g.home,home);
  assert.ok(departureError(g));assert.ok(validateSave(g));
});
test('coffee charges once, caps daily cups, partial break effects and unpaid break minutes',()=>{
  let g=advanceGame(careerAction(hired(),{kind:'depart'}),123);
  const before=g.budget,energy=g.sim.needs.energy;
  g=careerAction(g,{kind:'refreshment',refreshment:'coffee'});
  assert.equal(g.budget,before-18);
  assert.equal(careerAction(g,{kind:'refreshment',refreshment:'coffee'}),g);
  g=advanceGame(g,10);
  assert.ok(g.sim.needs.energy>energy+4&&g.sim.needs.energy<energy+7);
  assert.equal(g.career.shift.worked,120);
  g=careerAction(g,{kind:'resume'});g=advanceGame(g,5);
  assert.ok(refreshmentError(g,'coffee'));
  g.budget=0;assert.equal(refreshmentError(g,'lunch'),'余额不足');
});
test('long uninterrupted shifts lower mood and energy more than resting',()=>{
  const start=careerAction(hired(),{kind:'depart'});start.sim.needs.hunger=100;start.sim.needs.bladder=100;
  const g=advanceGame(start,303);
  assert.ok(g.career.stress>20);assert.ok(g.sim.needs.fun<70);assert.ok(g.sim.needs.energy<65);
  const before=structuredClone(g);
  const rested=advanceGame(careerAction(before,{kind:'rest'}),15);
  assert.ok(rested.career.stress<g.career.stress);
  assert.equal(rested.career.shift.continuous,0);assert.ok(validateSave(rested));
});
test('office restroom prevents depletion and autonomous residents use it',()=>{
  let g=advanceGame(careerAction(hired(),{kind:'depart'}),3);
  g.sim.needs.bladder=10;g.sim.autonomy=true;
  g=advanceGame(g,17);
  assert.equal(g.sim.wellbeing.accidents,0);assert.ok(g.sim.needs.bladder>90);
  assert.equal(g.career.phase,'working');assert.ok(validateSave(g));
});
test('end of shift pays only worked minutes even after reloading',()=>{
  let g=hired();g.sim.time=1000;g=careerAction(g,{kind:'depart'});
  g=advanceGame(g,25);
  assert.equal(g.career.location,'home');assert.equal(g.career.lastPay.minutes,17);
  const amount=g.budget;g=advanceGame(migrateGame(JSON.parse(JSON.stringify(g))),10);assert.equal(g.budget,amount);
});
test('paths reach the imported office work desk, cafe and restroom without empty routing',()=>{
  for(const [a,b] of [['entry','approach'],['approach','cafe'],['approach','toilet']]){
    const path=officeRoute(OFFICE[a],OFFICE[b]);assert.ok(path.length>1);assert.deepEqual(path.at(-1),OFFICE[b]);
  }
});
