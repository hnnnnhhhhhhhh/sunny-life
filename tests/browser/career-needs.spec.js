import {test,expect} from '@playwright/test';
import {newApartmentGame,advanceGame} from '../../src/game.js';
import {careerAction} from '../../src/career.js';

const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
const state=page=>page.evaluate(()=>window.__sunny.state().game);
async function boot(page,game){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(g=>{
    if(!localStorage.getItem('sunny-life.save.v1'))localStorage.setItem('sunny-life.save.v1',JSON.stringify(g));
  },game);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  return errors;
}
function officeGame(){
  let game=newApartmentGame();game.sim.time=540;game.sim.autonomy=false;
  game=careerAction(game,{kind:'hire',jobId:'assistant'});
  return advanceGame(careerAction(game,{kind:'depart'}),20);
}
async function pause(page){
  const button=page.getByRole('button',{name:'暂停生活',exact:true});
  if(await button.count())await button.click();
}

test('computer job search, hiring, commute and paid return preserve the apartment',async({page})=>{
  test.setTimeout(120000);
  const game=newApartmentGame();game.sim.autonomy=false;game.sim.time=545;
  const errors=await boot(page,game);
  await page.getByRole('tab',{name:'职业',exact:true}).click();
  await page.getByRole('button',{name:'从电脑查找工作',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'青禾招聘'})).toBeVisible({timeout:25000});
  expect((await diag(page)).computers.find(c=>c.id==='desk-1').mode).toBe('jobs');
  await page.getByRole('article').filter({has:page.getByRole('heading',{name:/文档助理/})}).getByRole('button',{name:'选择并入职'}).click();
  await expect.poll(()=>state(page).then(g=>g.career.jobId)).toBe('assistant');
  await expect.poll(()=>diag(page).then(d=>d.activity)).toBeNull();
  await page.getByRole('button',{name:'出门上班',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.location),{timeout:60000}).toBe('office');
  await expect.poll(()=>state(page).then(g=>g.career.phase),{timeout:10000}).toBe('working');
  await expect.poll(()=>diag(page).then(d=>d.workplace?.screen.playing)).toBe(true);
  await expect.poll(()=>state(page).then(g=>g.career.shift.worked),{timeout:8000}).toBeGreaterThan(3);
  expect((await diag(page)).workplace.asset.loaded).toBe(true);
  expect(Math.max(...(await diag(page)).resident.washDistances)).toBeLessThan(.04);
  await expect(page.getByRole('button',{name:'建造',exact:true})).toBeDisabled();
  await pause(page);
  const frozen=await state(page),d=await diag(page);
  await page.waitForTimeout(350);
  expect((await state(page)).career.shift.worked).toBe(frozen.career.shift.worked);
  expect((await diag(page)).resident.palms).toEqual(d.resident.palms);
  await page.screenshot({path:'test-results/career-working.png'});
  await page.getByRole('button',{name:'提前下班',exact:true}).click();
  const paid=await state(page),budget=paid.budget;
  expect(budget).toBeGreaterThan(game.budget);
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.location),{timeout:12000}).toBe('home');
  expect((await state(page)).home).toEqual(game.home);
  expect((await state(page)).budget).toBe(budget);
  await expect(page.getByRole('button',{name:'今日已结算',exact:true})).toBeDisabled();
  await page.locator('.save-status').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  expect((await state(page)).budget).toBe(budget);
  expect((await state(page)).career.lastPay).toEqual(paid.career.lastPay);
  expect(errors).toEqual([]);
});

test('office coffee is paid once, reached on foot and survives a refresh',async({page})=>{
  test.setTimeout(120000);
  const game=officeGame(),errors=await boot(page,game);
  await pause(page);
  await page.getByRole('button',{name:/咖啡\s*18/}).click();
  expect((await state(page)).budget).toBe(game.budget-18);
  await expect(page.getByRole('button',{name:/咖啡\s*18/})).toBeDisabled();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.phase),{timeout:15000}).toBe('break');
  await expect.poll(()=>diag(page).then(d=>d.workplace.cup),{timeout:5000}).toBe(true);
  await pause(page);
  const before=await state(page);
  expect((await diag(page)).workplace.cup).toBe(true);
  await page.getByRole('button',{name:'查看咖啡吧',exact:true}).click();
  await page.waitForTimeout(700);
  await page.screenshot({path:'test-results/career-coffee.png'});
  await page.locator('.save-status').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  await pause(page);
  expect((await state(page)).budget).toBe(before.budget);
  expect((await state(page)).career.coffeesToday).toBe(1);
  expect((await state(page)).career.phase).toBe('break');
  expect((await diag(page)).workplace.cup).toBe(true);
  await page.getByRole('button',{name:'继续工作',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.phase),{timeout:15000}).toBe('working');
  await expect.poll(()=>diag(page).then(d=>d.workplace.cup)).toBe(false);
  expect(errors).toEqual([]);
});

test('office restroom is private, restores bladder and returns to the desk',async({page})=>{
  test.setTimeout(90000);
  const game=officeGame();game.sim.needs.bladder=18;
  const errors=await boot(page,game);
  await page.getByRole('button',{name:'去洗手间',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.phase),{timeout:15000}).toBe('toilet');
  await expect.poll(()=>diag(page).then(d=>d.workplace.privacy)).toBe(true);
  await expect.poll(()=>state(page).then(g=>g.career.phase),{timeout:20000}).toBe('working');
  expect((await state(page)).sim.needs.bladder).toBeGreaterThan(90);
  expect((await state(page)).sim.wellbeing.accidents).toBe(0);
  expect((await diag(page)).workplace.privacy).toBe(false);
  expect(errors).toEqual([]);
});

test('bladder zero triggers one accident and red hygiene, survives save and permits shower recovery',async({page})=>{
  test.setTimeout(90000);
  const game=newApartmentGame();game.sim.autonomy=false;game.sim.needs.bladder=0;
  const errors=await boot(page,game);
  await expect.poll(()=>state(page).then(g=>g.sim.wellbeing.accidents)).toBe(1);
  await pause(page);
  expect((await state(page)).sim.needs.hygiene).toBe(0);
  await expect(page.locator('[data-mood="critical"]')).toContainText('窘迫');
  expect((await diag(page)).mood.color).toBe('#cb5c52');
  await expect(page.getByRole('meter',{name:'清洁',exact:true})).toHaveAttribute('aria-valuetext','0，紧急');
  await page.screenshot({path:'test-results/needs-accident.png'});
  await page.locator('.save-status').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  expect((await state(page)).sim.wellbeing.accidents).toBe(1);
  await page.getByRole('button',{name:'室内剖面',exact:true}).click();await page.waitForTimeout(800);
  const p=await page.evaluate(()=>{
    const f=window.__sunny.state().game.home.furniture.find(f=>f.type==='shower');
    return window.__sunny.project(f.x,1.05,f.z);
  });
  await page.mouse.click(p.x,p.y);await page.getByRole('button',{name:'洗澡',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.sim.needs.hygiene),{timeout:30000}).toBeGreaterThan(50);
  expect((await state(page)).sim.wellbeing.accidents).toBe(1);expect(errors).toEqual([]);
});

test('six need bars use the same severity palette and loneliness has a specific mood',async({page})=>{
  const game=newApartmentGame();game.sim.autonomy=false;game.avatar.traits=['社交达人'];
  Object.assign(game.sim.needs,{hunger:80,energy:40,social:0,fun:18,hygiene:55,bladder:70});
  await boot(page,game);await pause(page);
  await expect(page.locator('[data-mood="critical"]')).toContainText('渴望陪伴');
  const bars=await page.locator('.need').evaluateAll(nodes=>nodes.map(n=>({level:n.dataset.level,color:n.style.getPropertyValue('--need-color')})));
  expect(bars.map(b=>b.level)).toEqual(['good','warning','critical','critical','good','good']);
  expect(new Set(bars.filter(b=>b.level==='good').map(b=>b.color)).size).toBe(1);
});

test('mobile office scene and career controls do not overlap time or navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=await boot(page,officeGame());await pause(page);
  await page.waitForTimeout(900);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const rects=await page.evaluate(()=>['.resident-panel','.time-controls','.mode-switch'].map(s=>{
    const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};
  }));
  expect(rects[0].bottom).toBeLessThanOrEqual(rects[1].top);
  const pixels=await page.evaluate(()=>window.__sunny.diagnostics().samples);
  expect(new Set(pixels.map(p=>p.join(','))).size).toBeGreaterThan(3);
  await page.screenshot({path:'test-results/career-mobile.png'});
  await page.getByRole('button',{name:'展开居民面板',exact:true}).click();
  await expect(page.getByRole('button',{name:'去洗手间',exact:true})).toBeVisible();
  const fits=await page.locator('.resident-panel').evaluate(el=>{
    const rect=el.getBoundingClientRect();return {width:el.scrollWidth,client:el.clientWidth,top:rect.top,bottom:rect.bottom};
  });
  expect(fits.width).toBe(fits.client);expect(fits.bottom).toBeLessThanOrEqual(rects[1].top);
  await page.screenshot({path:'test-results/career-mobile-expanded.png'});
  expect(errors).toEqual([]);
});

test('office walking and getting up remain continuous, including early departure mid-route',async({page})=>{
  test.setTimeout(90000);
  const errors=await boot(page,officeGame());
  await page.getByRole('button',{name:/咖啡\s*18/}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  const moves=await page.evaluate(()=>new Promise(resolve=>{
    const rows=[],start=performance.now();let last=0;
    function sample(time){
      if(time-last>35){
        const d=window.__sunny.diagnostics({pixels:false});
        rows.push({time,position:d.position,phase:window.__sunny.state().game.career.phase});last=time;
      }
      if(time-start<4300)requestAnimationFrame(sample);else resolve(rows);
    }requestAnimationFrame(sample);
  }));
  const movesWithTime=moves.slice(1).map((row,i)=>({
    distance:Math.hypot(...row.position.map((v,a)=>v-moves[i].position[a])),
    seconds:(row.time-moves[i].time)/1000,
  }));
  // Software WebGL samples can be 350ms apart; distinguish travel from a discontinuity.
  for(const move of movesWithTime)expect(move.distance).toBeLessThan(.25+4*move.seconds);
  const shortFrames=movesWithTime.filter(move=>move.seconds<=.1);
  if(shortFrames.length)expect(Math.max(...shortFrames.map(move=>move.distance))).toBeLessThan(.65);
  expect(new Set(moves.map(r=>r.phase)).has('toCafe')).toBe(true);
  await page.getByRole('button',{name:'提前下班',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.location),{timeout:12000}).toBe('home');
  expect(errors).toEqual([]);
});

test('failed office download keeps employment, money and home intact and can be retried',async({page})=>{
  test.setTimeout(90000);
  let game=newApartmentGame();game.sim.autonomy=false;game.sim.time=550;
  game=careerAction(game,{kind:'hire',jobId:'assistant'});
  await page.route('**/models/office/office.glb*',route=>route.abort());
  await boot(page,game);
  await page.getByRole('tab',{name:'职业',exact:true}).click();
  await page.getByRole('button',{name:'出门上班',exact:true}).click();
  await expect(page.getByRole('status',{name:'游戏通知'})).toContainText('加载失败',{timeout:10000});
  expect((await state(page)).career.location).toBe('home');expect((await state(page)).budget).toBe(game.budget);
  await page.unroute('**/models/office/office.glb*');
  await page.getByRole('button',{name:'出门上班',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.location),{timeout:60000}).toBe('office');
});

test('undoing decoration does not undo salary or coffee spending',async({page})=>{
  test.setTimeout(90000);
  let game=newApartmentGame();game.sim.autonomy=false;game.sim.time=550;
  game=careerAction(game,{kind:'hire',jobId:'assistant'});
  await boot(page,game);
  await page.getByRole('button',{name:'建造',exact:true}).click();
  await page.getByRole('button',{name:'墙面与地板',exact:true}).click();
  await page.getByRole('button',{name:'墙面颜色 2',exact:true}).click();
  await page.getByRole('button',{name:'生活',exact:true}).click();
  await page.getByRole('tab',{name:'职业',exact:true}).click();
  await page.getByRole('button',{name:'出门上班',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.phase),{timeout:60000}).toBe('working');
  await page.getByRole('button',{name:/咖啡\s*18/}).click();
  await expect.poll(()=>diag(page).then(d=>d.workplace.cup),{timeout:12000}).toBe(true);
  await page.getByRole('button',{name:'提前下班',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.location),{timeout:12000}).toBe('home');
  const budget=(await state(page)).budget;
  expect(budget).not.toBe(game.budget);
  await page.getByRole('button',{name:'建造',exact:true}).click();
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  expect((await state(page)).home.wallColor).toBe(game.home.wallColor);
  expect((await state(page)).budget).toBe(budget);
  await page.getByRole('button',{name:'重做',exact:true}).click();
  expect((await state(page)).budget).toBe(budget);
});
