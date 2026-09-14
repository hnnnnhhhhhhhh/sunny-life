import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newApartmentGame,advanceGame,validateSave,migrateGame} from '../src/game.js';
import {careerAction,departureError,hiringError} from '../src/career.js';
import {WORK_EVENTS,STORY_EVENTS} from '../src/workplace-stories.js';
import {castForRank,newNpcState} from '../src/workplace-cast.js';
import {newWorkplace,completion,appraisalChoices,validateWorkplace} from '../src/workplace.js';
import {moodState} from '../src/needs.js';
import {retirementError} from '../src/life.js';
const action=(g,value)=>careerAction(g,{kind:'workplace',value});
function employee(id='assistant'){
  let g=newApartmentGame();g.sim.time=540;g.sim.autonomy=false;
  g.career.qualification=1000;g.career.highestRank=3;
  g=careerAction(g,{kind:'hire',jobId:id});
  return g;
}
function depart(g){
  Object.keys(g.sim.needs).forEach(k=>g.sim.needs[k]=100);
  g.career.stress=0;
  return advanceGame(careerAction(g,{kind:'depart'}),3);
}
const resolve=(g,id)=>action(g,{kind:'resolve',eventId:g.career.workplace.event.id,choiceId:id});
const dayAfter=g=>({...g,sim:{...g.sim,day:g.sim.day+1,time:540}});
function playShift(g,planned=true){
  g=depart(g);
  for(let i=0;i<700&&g.career.location==='office';i++){
    const w=g.career.workplace,p=w.project;
    if(planned&&w.event&&w.event.type!=='appraisal'){
      const id={direction:'options',meeting:'agenda',urgent:'trade',credit:'contract',scale:'pilot',rework:'record',
        vision:'pilot',support:'fix',allocation:'ledger',standards:'timeline',knowing:'boundary'}[w.event.type];
      g=resolve(g,id);
    }else if(planned&&cReady(g)&&p.spent-p.lastReport>=90&&p.communication<100)g=action(g,{kind:'report'});
    else if(planned&&cReady(g)&&completion(p)>=1&&!p.submitted)g=action(g,{kind:'submit'});
    g=advanceGame(g,1);
    assert.ok(validateSave(g),`invalid on minute ${i}`);
  }
  return g;
}
function cReady(g){const w=g.career.workplace;return g.career.phase==='working'&&!w.event&&!w.project.overhead;}
test('NPC roster and reporting relationships unlock with company scale',()=>{
  assert.deepEqual(castForRank(1).map(n=>n.id),['danbao']);
  assert.deepEqual(castForRank(2).map(n=>n.id),['danbao','shuijie','zhuoge']);
  assert.deepEqual(castForRank(3).map(n=>n.id),['danbao','shuijie','zhuoge','dayanzei']);
  let g=employee();assert.equal(action(g,{kind:'supervisor',npcId:'shuijie'}),g);
  g=employee('specialist');g=action(g,{kind:'supervisor',npcId:'shuijie'});
  assert.equal(g.career.workplace.supervisor,'shuijie');
  g=depart(g);assert.equal(action(g,{kind:'supervisor',npcId:'danbao'}),g);
});
test('six-hour project separates paid work from focused production and interruption minutes',()=>{
  let g=depart(employee()),p=g.career.workplace.project;
  assert.equal(p.required,360);
  g=advanceGame(g,45);assert.equal(g.career.workplace.event.type,'direction');
  const before=g.career.workplace.project.done;
  g=advanceGame(g,10);
  assert.equal(g.career.workplace.project.done,before);
  assert.equal(g.career.workplace.project.interrupted,10);
  assert.equal(g.career.shift.worked,55);
  const waiting=resolve(g,'wait'),explicit=resolve(g,'options');
  assert.equal(waiting.career.workplace.project.overhead,75);
  assert.equal(explicit.career.workplace.project.overhead,15);
  assert.ok(explicit.career.workplace.project.evidence>waiting.career.workplace.project.evidence);
});
test('unanswered interruptions take a single default branch and cannot be rerolled on reload',()=>{
  let g=advanceGame(depart(employee()),46),e=g.career.workplace.event;
  const reload=migrateGame(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(reload.career.workplace.event,e);
  g=advanceGame(reload,30);
  assert.equal(g.career.workplace.event,null);assert.equal(g.career.workplace.project.missed,1);
  const again=action(g,{kind:'resolve',eventId:e.id,choiceId:'options'});
  assert.equal(again,g);assert.equal(advanceGame(g,10).career.workplace.project.missed,1);
});
test('NPC promises require elapsed work and accepted artifacts; complex handoffs are slower',()=>{
  const base=depart(employee()),before=base.career.workplace.project.done;
  let small=action(base,{kind:'handoff',npcId:'danbao',task:'small'});
  const complex=action(base,{kind:'handoff',npcId:'danbao',task:'complex'});
  assert.equal(small.career.workplace.project.done,before);
  assert.equal(small.career.workplace.npcs.danbao.assignment.status,'promised');
  assert.ok(complex.career.workplace.npcs.danbao.assignment.delay>small.career.workplace.npcs.danbao.assignment.delay);
  small=advanceGame(small,42);assert.equal(small.career.workplace.npcs.danbao.assignment.status,'done');
  const credit=small.career.workplace.project.done;
  small=action(small,{kind:'collect',npcId:'danbao'});
  assert.equal(small.career.workplace.project.done,credit+30);
  assert.equal(action(small,{kind:'collect',npcId:'danbao'}),small);
});
test('clarifying a handoff shortens waiting, while NPC fatigue changes actual behavior',()=>{
  let g=depart(employee()),tired=structuredClone(g);
  Object.assign(tired.career.workplace.npcs.danbao,{energy:15,hunger:20,stress:80});
  g=action(g,{kind:'handoff',npcId:'danbao',task:'complex'});
  tired=action(tired,{kind:'handoff',npcId:'danbao',task:'complex'});
  assert.ok(tired.career.workplace.npcs.danbao.assignment.delay>g.career.workplace.npcs.danbao.assignment.delay);
  g=advanceGame(g,6);
  g=action(g,{kind:'followup',npcId:'danbao'});
  assert.equal(g.career.workplace.npcs.danbao.assignment.delay,11);
  assert.equal(action(g,{kind:'followup',npcId:'danbao'}),g);
});
test('unavailable NPCs and unsupported actions cannot affect small-company projects',()=>{
  let g=depart(employee());
  for(const kind of ['handoff','followup','collect']){
    assert.equal(action(g,{kind,npcId:'dayanzei',task:'small'}),g);
  }
  assert.equal(action(g,{kind:'handoff',npcId:'danbao',task:'malformed'}),g);
  assert.equal(action(g,{kind:'submit'}),g);
});
test('managers learn only shared progress and reporting consumes real project time',()=>{
  let g=depart(employee('manager'));
  assert.equal(g.career.workplace.npcs.dayanzei.informed,false);
  g=advanceGame(g,30);
  assert.equal(g.career.workplace.npcs.dayanzei.known,0);
  g=action(g,{kind:'report'});
  assert.equal(g.career.workplace.project.overhead,10);
  assert.equal(g.career.workplace.npcs.dayanzei.known,30/360);
  assert.equal(action(g,{kind:'report'}),g);
  const done=g.career.workplace.project.done;g=advanceGame(g,10);
  assert.equal(g.career.workplace.project.done,done);
});
test('planning and evidence materially improve review outcomes compared with blind acceptance',()=>{
  const passive=playShift(employee(),false),planned=playShift(employee(),true);
  const a=passive.career.workplace.reviews.at(-1),b=planned.career.workplace.reviews.at(-1);
  assert.ok(b.score>a.score+25);assert.ok(b.completion>a.completion);
  assert.equal(passive.career.workplace.warnings,1);
  assert.equal(planned.career.workplace.warnings,0);
  assert.equal(planned.career.location,'home');
  assert.equal(passive.career.lastPay.amount,planned.career.lastPay.amount);
});
test('large-company boss unfolds five distinct chapters over multiple projects with real initial help',()=>{
  let g=employee('manager');
  for(let i=0;i<5;i++){
    g=playShift(g);
    assert.equal(g.career.workplace.bossStage,i+1);
    assert.ok(g.career.workplace.journal.some(r=>r.npcId==='dayanzei'&&r.text.includes(WORK_EVENTS[STORY_EVENTS[i]].title)));
    if(i<4)g=dayAfter(g);
  }
  assert.ok(g.career.workplace.journal.some(r=>r.text.includes('个人责任边界')));
  assert.ok(validateSave(g));
});
test('closeness does not prevent ownership competition and record keeping protects contribution',()=>{
  let g=depart(employee('specialist'));
  g.career.workplace.npcs.shuijie.closeness=100;
  g=advanceGame(g,30);g=action(g,{kind:'report'});g=advanceGame(g,15);g=resolve(g,'options');
  g=advanceGame(g,120);
  assert.equal(g.career.workplace.event.type,'credit');
  const share=resolve(g,'share'),record=resolve(g,'contract');
  assert.equal(share.career.workplace.project.credit,60);
  assert.equal(record.career.workplace.project.credit,95);
  assert.ok(share.career.workplace.project.done>g.career.workplace.project.done);
});
test('repeated poor work prompts appeal before dismissal, settles salary once and permits new employment',()=>{
  let g=employee();
  for(let i=0;i<3;i++){g=playShift(g,false);if(i<2){assert.equal(g.career.workplace.event,null);g=dayAfter(g);}}
  assert.equal(g.career.workplace.event.type,'appraisal');assert.equal(g.career.jobId,'assistant');
  assert.ok(departureError(g));assert.ok(hiringError(g,'designer'));
  assert.ok(retirementError(g));
  const money=g.budget,experience=g.career.qualification;
  assert.equal(appraisalChoices(g).find(v=>v.id==='evidence').disabled,true);
  assert.equal(resolve(g,'evidence'),g);
  g=resolve(g,'accept');
  assert.equal(g.career.jobId,null);assert.equal(g.budget,money);assert.equal(g.career.qualification,experience);
  assert.equal(g.career.workplace.emotion.remaining,4320);
  Object.keys(g.sim.needs).forEach(k=>g.sim.needs[k]=100);
  assert.equal(moodState(g).label,'失业后的失落');assert.ok(validateSave(g));
  const recovered=migrateGame(JSON.parse(JSON.stringify(g)));
  g=careerAction(recovered,{kind:'hire',jobId:'designer'});
  assert.equal(g.career.jobId,'designer');assert.equal(g.budget,money);
  assert.equal(g.career.workplace.warnings,0);
});
test('documented appeal and one improvement plan can save employment without repeating rewards',()=>{
  let base=employee();
  for(let i=0;i<3;i++){base=playShift(base,false);if(i<2)base=dayAfter(base);}
  const evidence=structuredClone(base);
  Object.assign(evidence.career.workplace.reviews.at(-1),{evidence:60,communication:60});
  const saved=resolve(evidence,'evidence');
  assert.equal(saved.career.jobId,'assistant');assert.equal(saved.career.workplace.warnings,2);
  assert.equal(saved.career.workplace.reviews.at(-1).outcome,'复核保留任职');
  const plan=resolve(base,'plan');assert.equal(plan.career.workplace.pipUsed,true);
  const failed=playShift(dayAfter(plan),false);
  assert.equal(failed.career.workplace.event.type,'appraisal');
  assert.equal(appraisalChoices(failed).find(v=>v.id==='plan').disabled,true);
});
test('healthy recovery changes mood and medical departure does not add a warning',()=>{
  let g=depart(employee());g.sim.needs.energy=4;
  g=advanceGame(g,6);assert.equal(g.career.location,'home');
  assert.equal(g.career.workplace.warnings,0);assert.ok(g.career.workplace.reviews[0].healthExit);
  g=advanceGame(g,721);assert.equal(g.career.workplace.emotion,null);
});
test('legacy saves migrate safely and malformed event, relationship or task state is rejected',()=>{
  const old=employee();delete old.career.workplace;
  assert.ok(validateSave(old));
  const upgraded=migrateGame(old);assert.deepEqual(upgraded.career.workplace,newWorkplace());
  const active=advanceGame(depart(employee()),45);
  for(const mutate of [
    w=>w.project.required=-1,w=>w.event.type='__proto__',w=>w.event.npcId='dayanzei',
    w=>w.project.requests=[{}],w=>w.npcs.danbao.trust=Infinity,w=>w.event.projectId=9999,
    w=>w.bossStage=9,w=>w.reviews=[null],w=>w.npcs={...newNpcState(),bad:{}},
  ]){
    const bad=structuredClone(active);mutate(bad.career.workplace);assert.equal(validateSave(bad),false);
  }
  assert.equal(validateWorkplace(null,active.sim),false);
});

test('legacy office saves retain paid work and do not replay missed interruption checkpoints',()=>{
  const old=advanceGame(depart(employee()),200);delete old.career.workplace;
  assert.ok(validateSave(old));
  const restored=migrateGame(JSON.parse(JSON.stringify(old))),w=restored.career.workplace;
  assert.equal(restored.career.shift.worked,200);
  assert.equal(w.project.done,200);assert.equal(w.project.events,2);
  assert.equal(w.event,null);assert.ok(validateSave(restored));
  assert.equal(advanceGame(restored,5).career.workplace.event,null);
});
