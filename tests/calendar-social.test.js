import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newApartmentGame,advanceGame,validateSave,migrateGame} from '../src/game.js';
import {dateFor,workday,calendarAction} from '../src/calendar.js';
import {advanceFinance,financeAction,utilities,serviceError} from '../src/finance.js';
import {careerAction,departureError} from '../src/career.js';
import {socialAction,SOCIAL_ACTIONS,socialActionError} from '../src/social.js';
import {emotionProfile,addEmotion,reflectionAction} from '../src/emotions.js';
import {moodState} from '../src/needs.js';
import {lifeAction} from '../src/life.js';
const fresh=()=>{const g=newApartmentGame();g.sim.autonomy=false;return g;};
function guestGame(){
  let g=fresh();g=socialAction(g,{kind:'invite',ids:['neighbor-1'],visitKind:'chat'});
  return socialAction(g,{kind:'arrived',id:g.social.visit.id});
}
function interact(g,verb){
  g=socialAction(g,{kind:'begin',id:'neighbor-1',verb});
  g=advanceGame(g,SOCIAL_ACTIONS[verb].duration,{guestActive:true});
  return socialAction(g,{kind:'complete',id:'neighbor-1',verb,visitId:g.social.visit.id});
}
test('weekday and monthly calendar are deterministic across midnight and month rollover',()=>{
  assert.deepEqual(dateFor(1),{month:1,date:1,weekday:'周一'});
  assert.equal(workday(6),false);assert.equal(workday(7),false);assert.equal(workday(8),true);
  assert.deepEqual(dateFor(29),{month:2,date:1,weekday:'周一'});
  let g=fresh();g.sim.time=1439.5;g=advanceGame(g,1.5);
  assert.equal(g.sim.day,2);assert.equal(g.sim.time,1);assert.equal(dateFor(g.sim.day).weekday,'周二');
});
test('calendar add remove and save use stable IDs and reject malformed inputs',()=>{
  let g=fresh();g=calendarAction(g,{kind:'add',day:3,time:1080,title:'朋友聚会'});
  assert.ok(validateSave(g));assert.equal(g.calendar.events[0].title,'朋友聚会');
  const saved=migrateGame(JSON.parse(JSON.stringify(g)));
  assert.equal(calendarAction(saved,{kind:'add',day:3,time:NaN,title:'bad'}),saved);
  g=calendarAction(saved,{kind:'remove',id:g.calendar.events[0].id});assert.equal(g.calendar.events.length,0);
});
test('rent is four daily salaries at signing and does not increase immediately with a promotion',()=>{
  let g=fresh();g=advanceFinance(g,450);assert.equal(g.finance.rent,1800);assert.equal(g.finance.leaseLocked,true);
  g=advanceFinance(g,1000);assert.equal(g.finance.rent,1800);
  g.sim.day=29;g=advanceGame(g,.5);
  assert.equal(g.finance.invoices.find(i=>i.kind==='rent').amount,1800);
  assert.equal(g.finance.invoices.length,5);assert.equal(g.finance.nextDue,57);
  assert.ok(validateSave(g));
  assert.equal(advanceGame(g,1).finance.invoices.length,5);
});
test('utility grace periods disconnect actual services and one payment restores them once',()=>{
  let g=fresh();g.sim.day=29;g=advanceGame(g,1);assert.equal(utilities(g).power,true);
  g.sim.day=31;g=advanceGame(g,1);assert.equal(utilities(g).power,false);
  assert.ok(serviceError(g,'watch'));assert.ok(serviceError(g,'jobSearch'));
  assert.equal(serviceError(g,'eat','toast'),null);assert.ok(serviceError(g,'eat','steak'));
  const bill=g.finance.invoices.find(i=>i.kind==='power'),money=g.budget;
  g=financeAction(g,{kind:'pay',id:bill.id});
  assert.equal(g.budget,money-120);assert.equal(utilities(g).power,true);
  assert.equal(financeAction(g,{kind:'pay',id:bill.id}),g);
  g.sim.day=33;g=advanceGame(g,1);
  assert.equal(utilities(g).water,false);assert.equal(utilities(g).phone,false);assert.equal(utilities(g).internet,false);
  assert.ok(serviceError(g,'shower'));assert.ok(validateSave(g));
});
test('autopay respects funds and purchased homes replace rent with upkeep',()=>{
  let g=fresh();g.life.housing=1;g.sim.day=29;g.finance.autoPay=true;g.budget=100;
  g=advanceGame(g,1);
  assert.equal(g.finance.invoices.some(i=>i.kind==='rent'),false);
  assert.equal(g.finance.invoices.find(i=>i.kind==='upkeep').amount,300);
  assert.ok(g.budget>=0);assert.ok(g.finance.invoices.some(i=>!i.paid));assert.ok(validateSave(g));
});
test('weekday absence is unpaid, warns once per day and leads to a review after repeated absence',()=>{
  let g=fresh();g=careerAction(g,{kind:'hire',jobId:'assistant'});const money=g.budget;
  for(let day=1;day<=3;day++){
    g.sim.day=day;g.sim.time=1019;g=advanceGame(g,2);
    assert.equal(g.career.attendance.absences,day);
    g=advanceGame(g,5);assert.equal(g.career.attendance.absences,day);
  }
  assert.equal(g.budget,money);assert.equal(g.career.attendance.review,true);assert.ok(departureError(g));assert.ok(validateSave(g));
  g=careerAction(g,{kind:'attendance',value:{kind:'review',choice:'plan'}});
  assert.equal(g.career.attendance.review,false);assert.equal(g.career.attendance.absences,2);
  g.sim.day=4;g.sim.time=1019;g=advanceGame(g,2);
  g=careerAction(g,{kind:'attendance',value:{kind:'review',choice:'accept'}});
  assert.equal(g.career.jobId,null);assert.equal(g.budget,money);assert.ok(validateSave(g));
});
test('weekends and advance leave do not count as absence, while late arrival is recorded',()=>{
  let g=fresh();g.sim.time=500;g=careerAction(g,{kind:'hire',jobId:'assistant'});
  g=careerAction(g,{kind:'attendance',value:{kind:'leave'}});
  assert.equal(g.career.attendance.leaveDay,1);
  g.sim.time=1019;g=advanceGame(g,2);assert.equal(g.career.attendance.absences,0);
  g.sim.day=6;g.sim.time=540;assert.match(departureError(g),/休息日/);
  g.sim.time=1019;g=advanceGame(g,2);assert.equal(g.career.attendance.absences,0);
  g.sim.day=8;g.sim.time=600;g=careerAction(g,{kind:'depart'});
  assert.equal(g.career.attendance.records.at(-1).kind,'late');assert.equal(g.career.attendance.records.at(-1).minutes,60);
});
test('friends arrive before interaction and parties charge once without granting phantom relationship',()=>{
  let g=fresh(),money=g.budget;
  g=socialAction(g,{kind:'invite',ids:['neighbor-1','neighbor-2'],visitKind:'party'});
  assert.equal(g.budget,money-60);assert.equal(g.social.visit.stage,'arriving');
  assert.equal(socialAction(g,{kind:'invite',ids:['neighbor-1'],visitKind:'party'}),g);
  assert.ok(socialActionError(g,'neighbor-1','talk'));
  g=socialAction(g,{kind:'arrived',id:g.social.visit.id});
  const fp=g.social.contacts[0].friendship;
  assert.equal(socialAction(g,{kind:'complete',id:'neighbor-1',verb:'talk',visitId:g.social.visit.id}),g);
  g=interact(g,'talk');assert.equal(g.social.contacts[0].friendship,fp+6);
  assert.ok(socialActionError(g,'neighbor-1','talk'));assert.ok(validateSave(g));
});
test('romantic commitment requires friendship affection and trust, and supports breakup',()=>{
  let g=guestGame();Object.assign(g.social.contacts[0],{friendship:65,romance:45,trust:60});
  g=interact(g,'confess');assert.equal(g.social.contacts[0].relationship,'partner');
  assert.equal(emotionProfile(g).dominant,'sweet');
  g=advanceGame(g,8);g=interact(g,'breakup');assert.equal(g.social.contacts[0].relationship,'ex');
  assert.equal(g.social.contacts[0].romance,10);assert.ok(g.emotions.effects.some(e=>e.id==='breakup'));
});
test('job stress and a blackout outweigh sweetness and can cause a repairable conflict',()=>{
  let g=guestGame();g.sim.day=31;g.finance.nextDue=29;
  g=advanceFinance(g,450);g.career.stress=80;
  Object.assign(g.social.contacts[0],{friendship:70,romance:60,trust:70,relationship:'partner'});
  g=addEmotion(g,'sweet','sweet','刚刚见到恋人',40,180);
  assert.equal(emotionProfile(g).dominant,'tense');
  g=advanceGame(g,31);
  assert.ok(g.social.conflict);const serial=g.social.conflict.id;
  const kindness=socialAction(g,{kind:'resolveConflict',id:serial,choice:'explain'});
  const argument=socialAction(g,{kind:'resolveConflict',id:serial,choice:'lash'});
  assert.ok(kindness.social.contacts[0].trust>argument.social.contacts[0].trust);
  assert.ok(argument.social.contacts[0].resentment>=25);
  assert.equal(socialAction(argument,{kind:'resolveConflict',id:serial,choice:'lash'}),argument);
  assert.ok(validateSave(argument));
});
test('apology reduces resentment without erasing romance or all existing mood sources',()=>{
  let g=guestGame();Object.assign(g.social.contacts[0],{relationship:'partner',resentment:30,romance:60,trust:55});
  g=addEmotion(g,'argument','hurt','争吵留下的不快',35,360);
  g=interact(g,'apologize');
  assert.equal(g.social.contacts[0].resentment,15);assert.equal(g.social.contacts[0].romance,60);
  assert.ok(g.emotions.effects.some(e=>e.id==='argument'));assert.ok(g.emotions.effects.some(e=>e.id==='repair'));
});
test('solitary rest can feel tranquil while stress and manual reflections are separately tracked',()=>{
  let g=fresh();g=advanceGame(g,3,{activity:'rest'});assert.equal(moodState(g).label,'宁静');
  g=reflectionAction(g,'stress');assert.equal(emotionProfile(g).dominant,'tense');
  assert.equal(reflectionAction(g,'joy'),g);
  g=advanceGame(g,241);assert.equal(g.emotions.effects.length,0);
});
test('going out with friends costs money and rewards only a completed trip',()=>{
  let g=fresh(),money=g.budget,fp=g.social.contacts[0].friendship;
  g=lifeAction(g,{kind:'shoppingStart',companionId:'neighbor-1'});
  assert.equal(g.budget,money-80);
  const interrupted=lifeAction(g,{kind:'shoppingReturn'});
  assert.equal(interrupted.social.contacts[0].friendship,fp);
  const complete=advanceGame(g,90);
  assert.equal(complete.social.contacts[0].friendship,fp+8);assert.ok(validateSave(complete));
});
test('new state survives migration and malicious or inconsistent save fields are rejected',()=>{
  const old=fresh();delete old.social;delete old.finance;delete old.calendar;delete old.emotions;delete old.career.attendance;
  assert.ok(validateSave(old));const g=migrateGame(old);assert.ok(validateSave(g));
  for(const change of [
    g=>{g.finance.invoices=[{id:1,kind:'__proto__',amount:10,due:1,paid:false}];},
    g=>{g.social.contacts[0].romance=NaN;},
    g=>{g.emotions.effects=[{id:'bad',emotion:'unknown'}];},
    g=>{g.calendar.events=[{id:1,day:-1,time:0,title:'bad'}];},
    g=>{g.career.attendance.absences=9;},
  ]){
    const bad=structuredClone(g);change(bad);assert.equal(validateSave(bad),false);
  }
});
