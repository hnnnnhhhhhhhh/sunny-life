import {test,expect} from '@playwright/test';
import {newApartmentGame,advanceGame} from '../../src/game.js';
import {lifeAction} from '../../src/life.js';
import {careerAction} from '../../src/career.js';
const state=page=>page.evaluate(()=>window.__sunny.state().game);
const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
function fresh(){const g=newApartmentGame();g.sim.autonomy=false;return g;}
async function boot(page,game){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(g=>{if(!localStorage.getItem('sunny-life.save.v1'))localStorage.setItem('sunny-life.save.v1',JSON.stringify(g));},game);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  return errors;
}
async function pause(page){
  const button=page.getByRole('button',{name:'暂停生活',exact:true});
  if(await button.count())await button.click();
}
async function furniture(page,type,y=1){
  await page.getByRole('button',{name:'室内剖面',exact:true}).click();
  await page.waitForTimeout(700);
  const p=await page.evaluate(({type,y})=>{
    const f=window.__sunny.state().game.home.furniture.find(f=>f.type===type);
    return window.__sunny.project(f.x,y,f.z);
  },{type,y});
  await page.mouse.click(p.x,p.y);
}
async function lifeTab(page){
  const expand=page.getByRole('button',{name:'展开居民面板',exact:true});
  if(await expand.count())await expand.click();
  await page.getByRole('tab',{name:'生活',exact:true}).click();
}

test('real bed entry starts slow recovery and reload continues the same sleep',async({page})=>{
  test.setTimeout(120000);
  const g=fresh();g.sim.needs.energy=5;
  const errors=await boot(page,g);
  await furniture(page,'bed',.85);
  await page.getByRole('button',{name:'睡个好觉',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:20000}).toBe('active');
  await expect.poll(()=>state(page).then(g=>g.life.sleep?.elapsed)).toBeGreaterThan(1);
  await pause(page);
  const before=await state(page);
  expect(before.sim.needs.energy).toBeLessThan(10);
  expect((await diag(page)).coverVisible).toBe(true);
  await page.screenshot({path:'.runtime/life-sleep.png'});
  await page.locator('.save-status').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:20000}).toBe('active');
  expect((await state(page)).life.sleep.elapsed).toBeGreaterThanOrEqual(before.life.sleep.elapsed);
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.life.sleep)).toBeNull();
  expect((await state(page)).sim.needs.energy).toBeLessThan(20);
  expect(errors).toEqual([]);
});

test('completed six-hour sleep leaves the bed with energy above ninety',async({page})=>{
  let g=fresh();g.sim.needs.energy=5;
  g=advanceGame(lifeAction(g,{kind:'sleepStart',bedId:'bed-1'}),359);
  const errors=await boot(page,g);
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.life.sleep),{timeout:20000}).toBeNull();
  expect((await state(page)).sim.needs.energy).toBeGreaterThan(90);
  expect((await diag(page)).coverVisible).toBe(false);
  expect(errors).toEqual([]);
});

test('returning home automatically washes and then hangs clothes on the balcony',async({page})=>{
  test.setTimeout(120000);
  let g=fresh();Object.keys(g.sim.needs).forEach(k=>g.sim.needs[k]=100);
  g.sim.autonomy=true;g.life.laundry.returnPending=false;
  g=lifeAction(g,{kind:'shoppingStart'});g.life.shopping.elapsed=89;
  const errors=await boot(page,g);
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.life.shopping)).toBeNull();
  await expect.poll(()=>state(page).then(g=>g.life.laundry.stage),{timeout:25000}).toBe('washing');
  await expect.poll(()=>state(page).then(g=>g.life.laundry.stage),{timeout:30000}).toBe('wet');
  await expect.poll(()=>state(page).then(g=>g.life.laundry.stage),{timeout:25000}).toBe('hanging');
  await expect.poll(()=>state(page).then(g=>g.life.laundry.stage),{timeout:15000}).toBe('drying');
  await pause(page);await lifeTab(page);
  await expect(page.getByText('晾干中',{exact:true})).toBeVisible();
  await page.screenshot({path:'.runtime/life-laundry.png'});
  expect(errors).toEqual([]);
});

test('shopping walks out, charges once, keeps the home view and supports early return',async({page})=>{
  const g=fresh(),errors=await boot(page,g);
  await lifeTab(page);
  await page.getByRole('button',{name:/出门购物/}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>!!g.life.shopping),{timeout:15000}).toBe(true);
  await pause(page);
  expect((await state(page)).budget).toBe(g.budget-80);
  expect((await state(page)).home).toEqual(g.home);
  expect((await diag(page)).workplace).toBeNull();
  expect((await diag(page)).playerVisible).toBe(false);
  await page.screenshot({path:'.runtime/life-shopping.png'});
  await page.locator('.save-status').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  await pause(page);
  expect((await state(page)).budget).toBe(g.budget-80);
  expect((await state(page)).life.shopping).not.toBeNull();
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.life.shopping)).toBeNull();
  expect((await diag(page)).playerVisible).toBe(true);
  expect((await state(page)).budget).toBe(g.budget-80);
  expect(errors).toEqual([]);
});

test('TV radial choices select actual changing program frames and pause freezes playback',async({page})=>{
  const g=fresh(),errors=await boot(page,g);
  await pause(page);await furniture(page,'tv',1.25);
  await expect(page.getByRole('dialog',{name:'电视节目'})).toBeVisible();
  await page.screenshot({path:'.runtime/life-tv-radial.png'});
  await page.getByRole('button',{name:'晚间新闻',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.televisions[0].playing),{timeout:15000}).toBe(true);
  expect((await diag(page)).televisions[0].channel).toBe('news');
  const first=(await diag(page)).televisions[0].checksum;
  await expect.poll(()=>diag(page).then(d=>d.televisions[0].checksum)).not.toBe(first);
  await pause(page);const frozen=(await diag(page)).televisions[0].checksum;
  await page.waitForTimeout(350);expect((await diag(page)).televisions[0].checksum).toBe(frozen);
  await page.screenshot({path:'.runtime/life-tv-news.png'});
  expect(errors).toEqual([]);
});

test('mobile TV and life controls fit and branching choices persist after reload',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=await boot(page,fresh());await pause(page);
  await furniture(page,'tv',1.25);
  await expect(page.getByRole('dialog',{name:'电视节目'})).toBeVisible();
  const rects=await page.locator('.tv-radial button').evaluateAll(nodes=>nodes.map(el=>{
    const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
  }));
  expect(rects.every(r=>r.left>=0&&r.right<=390&&r.top>=0&&r.bottom<=844)).toBe(true);
  await page.screenshot({path:'.runtime/life-mobile-tv.png'});
  await page.keyboard.press('Escape');
  await lifeTab(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const fits=await page.locator('.resident-panel').evaluate(el=>el.scrollWidth===el.clientWidth);
  expect(fits).toBe(true);
  await page.screenshot({path:'.runtime/life-mobile-panel.png'});
  await page.getByRole('button',{name:'邻里日常',exact:true}).click();
  await page.getByRole('button',{name:'聊聊最近的烦恼',exact:true}).click();
  await expect(page.getByText('我也有过这样的日子。你想听建议，还是只想说说？')).toBeVisible();
  await page.getByRole('button',{name:'有人听我说就很好',exact:true}).click();
  expect((await state(page)).dialogue.flags).toContain('value_company');
  await page.screenshot({path:'.runtime/life-mobile-dialogue.png'});
  await page.getByRole('button',{name:'结束交谈',exact:true}).click();
  await expect(page.getByRole('button',{name:'邻里日常 · 今日已聊',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'存档管理',exact:true}).click();
  await page.getByRole('button',{name:/保存到浏览器/}).click();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  expect((await state(page)).dialogue.flags).toContain('value_company');
  const pixels=await page.evaluate(()=>window.__sunny.diagnostics().samples);
  expect(new Set(pixels.map(p=>p.join(','))).size).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('housing purchase and retirement form a persisted financial lifecycle',async({page})=>{
  let g=fresh();g.budget=250000;g.career.totalEarned=60000;g.career.qualification=200;g.career.highestRank=2;
  g=careerAction(g,{kind:'hire',jobId:'manager'});
  const errors=await boot(page,g);await pause(page);await lifeTab(page);
  await page.getByRole('button',{name:'升级住宅',exact:true}).click();
  await page.getByRole('button',{name:'确认',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.life.housing)).toBe(1);
  expect((await state(page)).budget).toBe(205000);expect((await state(page)).home.width).toBe(14);
  await page.getByRole('button',{name:'提前退休',exact:true}).click();
  await page.getByRole('button',{name:'确认',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.life.retired)).toBe(true);
  expect((await state(page)).career.jobId).toBeNull();
  await page.locator('.save-status').click();await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  expect((await state(page)).life.retired).toBe(true);expect((await state(page)).budget).toBe(205000);
  expect(errors).toEqual([]);
});

test('meal choice charges premium price once and creates a visible steak plate',async({page})=>{
  const g=fresh();g.sim.needs.hunger=10;
  const errors=await boot(page,g);await pause(page);
  await furniture(page,'dining',.85);
  await page.getByRole('button',{name:'香煎牛排',exact:true}).click();
  await page.getByRole('button',{name:'开始用餐',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.mealVisible),{timeout:15000}).toBe(true);
  expect((await state(page)).budget).toBe(g.budget-45);
  expect((await diag(page)).activity.recipe).toBe('steak');
  await expect.poll(()=>state(page).then(g=>g.sim.needs.hunger),{timeout:20000}).toBeGreaterThan(80);
  expect((await state(page)).budget).toBe(g.budget-45);expect(errors).toEqual([]);
});

test('external dialogue file import rejects bad references and plays a validated document',async({page})=>{
  const errors=await boot(page,fresh());await pause(page);await lifeTab(page);
  const input=page.getByLabel('导入对话文档',{exact:true});
  await input.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"id":"broken"}')});
  await expect(page.getByRole('status').filter({hasText:'对话格式无效'})).toBeVisible();
  await input.setInputFiles('public/dialogue-example.json');
  await expect(page.getByRole('status').filter({hasText:'已导入'})).toBeVisible();
  await page.getByRole('button',{name:'The Community Garden',exact:true}).click();
  await page.getByRole('button',{name:'I would love to help.',exact:true}).click();
  expect((await state(page)).dialogue.flags).toContain('garden_friend');
  await page.getByRole('button',{name:'See you there.',exact:true}).click();
  await page.getByRole('button',{name:'结束交谈',exact:true}).click();
  await page.locator('.save-status').click();await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  expect((await state(page)).dialogue.documents[0].id).toBe('weekend_garden');
  expect(errors).toEqual([]);
});

test('earned qualifications unlock rank two through the computer after returning from work',async({page})=>{
  test.setTimeout(90000);
  let g=fresh();g.career.qualification=39;
  g=careerAction(g,{kind:'hire',jobId:'assistant'});
  g.sim.time=540;
  g=advanceGame(careerAction(g,{kind:'depart'}),44);
  g=advanceGame(careerAction(g,{kind:'leave'}),5);
  const errors=await boot(page,g);await pause(page);
  await page.getByRole('tab',{name:'职业',exact:true}).click();
  expect((await state(page)).career.qualification).toBeGreaterThanOrEqual(40-1e-8);
  await page.getByRole('button',{name:'查看其他工作',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'青禾招聘'})).toBeVisible({timeout:20000});
  const role=page.getByRole('article').filter({has:page.getByRole('heading',{name:/运营骨干/})});
  await role.getByRole('button',{name:'选择并入职',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.jobId)).toBe('specialist');
  expect((await state(page)).career.highestRank).toBe(2);
  expect(errors).toEqual([]);
});
