import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newApartmentGame,advanceGame,migrateGame,validateSave,upgradeHousing,switchResidence,GAME_MINUTES_PER_SECOND,navigationGrid,validatePlacement} from '../src/game.js';
import {lifeAction,SLEEP_MINUTES,SHOPPING,ageFor,ageEffects,newLife,motionRate,housingError,retirementError} from '../src/life.js';
import {careerAction,jobFor,hiringError} from '../src/career.js';
import {dialogueAction,parseDialogueDocument,DEFAULT_DIALOGUES,validateDocument,activeDialogue} from '../src/dialogue.js';
import {MEALS,planChat,planHandwash} from '../src/interactions.js';
import {dryingPoint} from '../src/household-props.js';

function fresh(){const g=newApartmentGame();g.sim.autonomy=false;return g;}
test('six game hours restore exhausted energy to 95, preserve partial sleep and survive reload',()=>{
  let game=fresh();game.sim.needs.energy=5;
  game=lifeAction(game,{kind:'sleepStart',bedId:'bed-1'});
  const partial=advanceGame(game,180);
  assert.equal(partial.life.sleep.elapsed,180);
  assert.equal(partial.sim.needs.energy,50);
  assert.ok(validateSave(partial));
  const five=advanceGame(migrateGame(JSON.parse(JSON.stringify(partial))),120);
  assert.ok(five.sim.needs.energy<90);
  const full=advanceGame(five,60);
  assert.equal(full.sim.needs.energy,95);assert.equal(full.life.sleep.elapsed,SLEEP_MINUTES);
  const cancelled=lifeAction(partial,{kind:'sleepStop'});
  assert.ok(advanceGame(cancelled,60).sim.needs.energy<50);
  assert.equal(advanceGame(game,30,{sleeping:false}).life.sleep.elapsed,0);
});
test('laundry enforces wash then hang, pauses without physical action and dries passively',()=>{
  let game=fresh();
  assert.equal(lifeAction(game,{kind:'laundryStart',task:'hang'}),game);
  game=lifeAction(game,{kind:'laundryStart',task:'wash'});
  assert.equal(advanceGame(game,20).life.laundry.elapsed,0);
  game=advanceGame(game,15,{laundry:'wash'});
  assert.equal(game.life.laundry.elapsed,15);
  game=migrateGame(JSON.parse(JSON.stringify(game)));
  game=advanceGame(game,15,{laundry:'wash'});assert.equal(game.life.laundry.stage,'wet');
  assert.equal(advanceGame(game,90).life.laundry.stage,'wet');
  game=lifeAction(game,{kind:'laundryStart',task:'hang'});
  game=advanceGame(game,10,{laundry:'hang'});assert.equal(game.life.laundry.stage,'drying');
  game=advanceGame(game,180);assert.equal(game.life.laundry.stage,'clean');
  assert.equal(game.life.laundry.cycles,1);assert.equal(game.life.laundry.returnPending,false);
  assert.ok(validateSave(game));
});
test('sink and drying rack have reachable real chore positions',()=>{
  const game=fresh(),grid=navigationGrid(game.home);
  const wash=planHandwash(game.home,game.home.furniture.find(f=>f.type==='sink'),game.sim,grid);
  assert.equal(wash.error,undefined);
  assert.equal(planChat(game.home,dryingPoint(game.home),wash.approach,grid).error,undefined);
});
test('shopping charges once, keeps the home, preserves partial rewards and returns automatically',()=>{
  let game=fresh(),budget=game.budget,home=game.home;
  game=lifeAction(game,{kind:'shoppingStart'});
  assert.equal(game.budget,budget-SHOPPING.price);assert.equal(game.home,home);
  assert.equal(lifeAction(game,{kind:'shoppingStart'}),game);
  game=advanceGame(game,40);assert.ok(validateSave(game));
  const restored=migrateGame(JSON.parse(JSON.stringify(game)));
  const returned=advanceGame(restored,50);
  assert.equal(returned.life.shopping,null);assert.equal(returned.budget,budget-SHOPPING.price);
  assert.ok(returned.life.laundry.returnPending);assert.equal(returned.career.location,'home');
  const cancelled=lifeAction(game,{kind:'shoppingReturn'});
  assert.equal(cancelled.budget,game.budget);assert.deepEqual(cancelled.sim.needs,game.sim.needs);
});
test('premium meals have higher satiety and an affordable fallback always exists',()=>{
  assert.ok(MEALS.steak.amount>MEALS.noodles.amount);
  assert.ok(MEALS.steak.price>MEALS.noodles.price);
  assert.equal(MEALS.toast.price,0);
  assert.ok(MEALS.noodles.amount>=40);
});
test('3x clock is exact while motion remains below twice normal speed',()=>{
  assert.equal(motionRate(0),0);assert.equal(motionRate(1),1);assert.equal(motionRate(3),1.6);
  const g=fresh(),a=advanceGame(g,GAME_MINUTES_PER_SECOND*30),b=advanceGame(g,GAME_MINUTES_PER_SECOND*90);
  assert.equal(b.sim.time-g.sim.time,(a.sim.time-g.sim.time)*3);
});
test('qualifications gate promotions and higher positions increase salary hours and pressure',()=>{
  let game=fresh();
  assert.ok(hiringError(game,'manager'));
  assert.equal(careerAction(game,{kind:'hire',jobId:'manager'}),game);
  game=careerAction(game,{kind:'hire',jobId:'assistant'});game.sim.time=540;
  game=advanceGame(careerAction(game,{kind:'depart'}),123);
  assert.ok(game.career.qualification>=3-1e-8);
  game=advanceGame(careerAction(game,{kind:'leave'}),5);
  const oldPay=game.career.lastPay;
  game.career.qualification=150;
  assert.ok(hiringError(game,'manager'));
  game=careerAction(game,{kind:'hire',jobId:'specialist'});
  assert.equal(game.career.highestRank,2);
  game=careerAction(game,{kind:'hire',jobId:'manager'});
  assert.equal(game.career.highestRank,3);
  assert.deepEqual(game.career.lastPay,oldPay);assert.ok(validateSave(game));
  assert.ok(jobFor('manager').salary>jobFor('assistant').salary);
  assert.ok(jobFor('manager').end>jobFor('assistant').end);
  assert.ok(jobFor('manager').pressure>jobFor('assistant').pressure);
});
test('higher ranks produce faster stress and colleague drift for identical working time',()=>{
  const run=id=>{
    let g=fresh();g.career.qualification=300;g.career.highestRank=3;
    g=careerAction(g,{kind:'hire',jobId:id});g.sim.time=540;
    return advanceGame(careerAction(g,{kind:'depart'}),140);
  };
  const entry=run('assistant'),manager=run('manager');
  assert.ok(manager.career.stress>entry.career.stress);
  assert.ok(manager.career.colleagues[0].trust<entry.career.colleagues[0].trust);
});
test('returning from work schedules household chores even across a large simulation step',()=>{
  let g=fresh();g.sim.time=540;g.life.laundry.returnPending=false;
  g=careerAction(g,{kind:'hire',jobId:'assistant'});
  g=advanceGame(careerAction(g,{kind:'depart'}),30);
  g=advanceGame(careerAction(g,{kind:'leave'}),10);
  assert.equal(g.career.location,'home');assert.ok(g.life.laundry.returnPending);
});
test('dialogue choices branch and persist without replaying one node for rewards',()=>{
  let game=fresh();game=careerAction(game,{kind:'hire',jobId:'assistant'});
  game=dialogueAction(game,{kind:'open',documentId:'colleague',contact:'lin',name:'林知夏',colleague:true});
  game=dialogueAction(game,{kind:'choose',choiceId:'help'});
  assert.equal(activeDialogue(game).node.id,'team');assert.equal(game.career.colleagues[0].trust,53);
  assert.equal(dialogueAction(game,{kind:'choose',choiceId:'help'}),game);
  game=migrateGame(JSON.parse(JSON.stringify(game)));
  game=dialogueAction(game,{kind:'choose',choiceId:'credit'});
  assert.ok(game.dialogue.flags.includes('team_player'));assert.ok(validateSave(game));
  game=dialogueAction(game,{kind:'close'});
  assert.equal(dialogueAction(game,{kind:'open',documentId:'colleague',contact:'lin',name:'林知夏',colleague:true}),game);
});
test('external dialogue validates references and effects, rejects prototype IDs and malformed imports',()=>{
  const doc=structuredClone(DEFAULT_DIALOGUES[0]);doc.id='custom';
  assert.deepEqual(parseDialogueDocument(JSON.stringify(doc)),doc);
  doc.nodes[0].choices[0].next='missing';assert.equal(validateDocument(doc),false);
  assert.throws(()=>parseDialogueDocument('{'));
  doc.nodes[0].choices[0].next='end';doc.nodes[0].choices[0].effects={budget:100000};assert.equal(validateDocument(doc),false);
  doc.nodes[0].choices[0].effects={stress:3};doc.id='__proto__';assert.equal(validateDocument(doc),false);
});
test('housing upgrades deduct current funds without resetting furnishings or salary history',()=>{
  let game=fresh();game.career.qualification=200;game.career.highestRank=2;
  game=careerAction(game,{kind:'hire',jobId:'manager'});
  game.budget=250000;game.career.totalEarned=60000;
  const furniture=game.home.furniture;
  game=upgradeHousing(game);assert.equal(game.budget,205000);assert.equal(game.home.width,14);
  assert.deepEqual(game.home.furniture.map(f=>[f.id,f.type,f.color]),furniture.map(f=>[f.id,f.type,f.color]));
  for(const f of game.home.furniture)assert.equal(validatePlacement(game.home,f,f.id),null,f.id);
  assert.ok(validateSave(game));
  game=upgradeHousing(game);assert.equal(game.budget,85000);assert.equal(game.home.width,16);
  assert.equal(upgradeHousing(game),game);assert.ok(validateSave(game));
  const switched=switchResidence(switchResidence(game,'apartment'),'coastal');
  assert.equal(switched.budget,game.budget);assert.equal(switched.home.width,16);
});
test('housing and retirement reject insufficient funds and retirement pensions settle once',()=>{
  let game=fresh();assert.ok(housingError(game,0));assert.ok(retirementError(game));
  assert.equal(upgradeHousing(game),game);assert.equal(lifeAction(game,{kind:'retire'}),game);
  game.budget=180000;game.career.totalEarned=25000;
  game=lifeAction(game,{kind:'retire'});assert.ok(game.life.retired);
  assert.equal(careerAction(game,{kind:'hire',jobId:'assistant'}),game);
  game.sim.time=1439;game=advanceGame(game,1);assert.equal(game.budget,180100);
  const restored=migrateGame(JSON.parse(JSON.stringify(game)));
  assert.equal(advanceGame(restored,30).budget,180100);assert.ok(validateSave(restored));
});
test('age uses the documented game scale and changes movement, fatigue and retirement threshold',()=>{
  const young=fresh(),older=fresh();older.sim.day=1+36*28;
  assert.equal(ageFor(young),24);assert.equal(ageFor(older),60);
  assert.ok(ageEffects(older).movement<ageEffects(young).movement);
  assert.ok(ageEffects(older).fatigue>ageEffects(young).fatigue);
  older.budget=90000;older.career.totalEarned=25000;
  assert.equal(retirementError(older),null);
});
test('legacy data gains life and dialogue defaults while invalid new state is rejected',()=>{
  const game=fresh();delete game.life;delete game.dialogue;delete game.career.qualification;delete game.career.colleagues;
  assert.ok(validateSave(game));
  const restored=migrateGame(game);assert.ok(validateSave(restored));
  assert.deepEqual(restored.life,newLife());
  for(const change of [
    g=>{g.life.sleep={bedId:'missing',elapsed:0,startEnergy:20};},
    g=>{g.life.laundry.stage='hacked';},
    g=>{g.life.shopping={elapsed:-5,x:0,z:0};},
    g=>{g.dialogue.active={documentId:'missing'};},
    g=>{g.career.qualification=Infinity;},
  ]){
    const bad=structuredClone(restored);change(bad);assert.equal(validateSave(bad),false);
  }
});
