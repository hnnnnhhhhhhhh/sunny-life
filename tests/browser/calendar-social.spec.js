import {test,expect} from '@playwright/test';
import {newApartmentGame,advanceGame} from '../../src/game.js';
import {advanceFinance} from '../../src/finance.js';
import {careerAction} from '../../src/career.js';
import {socialAction} from '../../src/social.js';
const state=p=>p.evaluate(()=>window.__sunny.state().game);
const diag=p=>p.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
const fresh=()=>{const g=newApartmentGame();g.sim.autonomy=false;return g;};
async function boot(page,game){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(g=>{if(!localStorage.getItem('sunny-life.save.v1'))localStorage.setItem('sunny-life.save.v1',JSON.stringify(g));},game);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  return errors;
}
async function pause(page){const b=page.getByRole('button',{name:'暂停生活',exact:true});if(await b.count())await b.click();}
async function expand(page){const b=page.getByRole('button',{name:'展开居民面板',exact:true});if(await b.count())await b.click();}
async function openSocial(page){await expand(page);await page.getByRole('tab',{name:'社交',exact:true}).click();await page.getByRole('button',{name:'朋友与恋爱',exact:true}).click();}
async function openBills(page){await expand(page);await page.getByRole('tab',{name:'生活',exact:true}).click();await page.getByRole('button',{name:'生活账单',exact:true}).click();}
async function close(page){await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();}

test('weekday clock and calendar create, persist and delete a dated appointment on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=await boot(page,fresh());await pause(page);
  await expect(page.locator('.time-reading')).toContainText('周一');
  await page.getByRole('button',{name:'打开日历',exact:true}).click();
  await page.getByRole('button',{name:'第1月6日 周六',exact:true}).click();
  await page.getByRole('textbox',{name:'日程名称',exact:true}).fill('朋友聚会');
  await page.getByLabel('日程时间',{exact:true}).fill('18:30');
  await page.getByRole('button',{name:'添加日程',exact:true}).click();
  await expect(page.getByText('18:30 · 朋友聚会',{exact:true})).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth===e.clientWidth)).toBe(true);
  await page.screenshot({path:'.runtime/daily-calendar-mobile.png'});
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  expect((await state(page)).calendar.events[0].title).toBe('朋友聚会');
  await page.getByRole('button',{name:'打开日历',exact:true}).click();
  await page.getByRole('button',{name:'第1月6日 周六',exact:true}).click();
  await page.getByRole('button',{name:'删除日程朋友聚会',exact:true}).click();
  expect((await state(page)).calendar.events).toEqual([]);expect(errors).toEqual([]);
});
test('power bill disables the TV and room lights until paid, without double charging',async({page})=>{
  let g=fresh();g.sim.day=31;g.sim.time=1230;g=advanceFinance(g,450);
  const errors=await boot(page,g);await pause(page);
  expect((await diag(page)).utilities.power).toBe(false);
  expect((await diag(page)).lighting.fixtures.every(l=>l.intensity===0)).toBe(true);
  await page.getByRole('button',{name:'室内剖面',exact:true}).click();await page.waitForTimeout(650);
  const pos=await page.evaluate(()=>window.__sunny.project(-3.35,1.25,3.85));
  await page.mouse.click(pos.x,pos.y);await page.getByRole('button',{name:'轻松喜剧',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect(page.getByRole('status',{name:'游戏通知'})).toContainText(/停电/);
  expect((await diag(page)).televisions[0].playing).toBe(false);
  await pause(page);await openBills(page);await page.screenshot({path:'.runtime/daily-bills.png'});
  const budget=(await state(page)).budget;
  await page.getByRole('button',{name:'缴纳电费 120',exact:true}).click();
  expect((await state(page)).budget).toBe(budget-120);
  await expect(page.getByRole('button',{name:'缴纳电费 120',exact:true})).toBeDisabled();
  await close(page);expect((await diag(page)).utilities.power).toBe(true);
  expect((await diag(page)).lighting.fixtures.some(l=>l.intensity>0)).toBe(true);
  expect(errors).toEqual([]);
});
test('friends walk in, interact face to face, and leave without lingering models',async({page})=>{
  test.setTimeout(90000);
  const errors=await boot(page,fresh());await openSocial(page);
  await page.getByRole('button',{name:'邀请来家聊天',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.social.visit?.stage),{timeout:15000}).toBe('active');
  expect((await diag(page)).guests).toHaveLength(1);
  const before=(await state(page)).social.contacts[0].friendship;
  await openSocial(page);await page.getByRole('button',{name:'聊聊近况',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.type),{timeout:15000}).toBe('guest');
  await expect.poll(()=>state(page).then(g=>g.social.contacts[0].friendship),{timeout:25000}).toBeGreaterThan(before);
  await pause(page);await page.screenshot({path:'.runtime/daily-friend-home.png'});
  await openSocial(page);await page.getByRole('button',{name:'送朋友回家',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.social.visit),{timeout:15000}).toBeNull();
  expect((await diag(page)).guests).toHaveLength(0);expect(errors).toEqual([]);
});
test('partner commitment happens through a real interaction and persists after reload',async({page})=>{
  test.setTimeout(90000);
  let g=fresh();Object.assign(g.social.contacts[0],{friendship:65,romance:45,trust:60});
  g=socialAction(g,{kind:'invite',ids:['neighbor-1'],visitKind:'date'});
  g=socialAction(g,{kind:'arrived',id:g.social.visit.id});
  const errors=await boot(page,g);await openSocial(page);
  await page.getByRole('button',{name:'确认恋爱关系',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.social.contacts[0].relationship),{timeout:25000}).toBe('partner');
  await pause(page);await expect(page.locator('[data-mood]')).toHaveText('甜蜜');
  await openSocial(page);await page.screenshot({path:'.runtime/daily-romance.png'});
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  expect((await state(page)).social.contacts[0].relationship).toBe('partner');expect(errors).toEqual([]);
});
test('work frustration plus blackout causes conflict and apology repairs some resentment',async({page})=>{
  test.setTimeout(90000);
  let g=fresh();g.sim.day=31;g=advanceFinance(g,450);g.career.stress=85;
  Object.assign(g.social.contacts[0],{friendship:75,romance:60,trust:70,relationship:'partner'});
  g=socialAction(g,{kind:'invite',ids:['neighbor-1'],visitKind:'date'});
  g=socialAction(g,{kind:'arrived',id:g.social.visit.id});
  g=advanceGame(g,29);
  const errors=await boot(page,g);await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect(page.getByRole('button',{name:'这次相处有些不愉快',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'这次相处有些不愉快',exact:true}).click();
  await page.screenshot({path:'.runtime/daily-conflict.png'});
  await page.getByRole('button',{name:'把不满发泄到对方身上',exact:true}).click();
  const angry=(await state(page)).social.contacts[0].resentment;expect(angry).toBeGreaterThanOrEqual(25);
  await openSocial(page);await page.getByRole('button',{name:'认真道歉',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.social.contacts[0].resentment),{timeout:25000}).toBeLessThan(angry);
  expect((await state(page)).emotions.effects.some(e=>e.id==='argument')).toBe(true);
  expect(errors).toEqual([]);
});
test('unexcused absence prompts review with job-loss consequences and no phantom pay',async({page})=>{
  let g=fresh();g=careerAction(g,{kind:'hire',jobId:'assistant'});
  for(let d=1;d<=2;d++){g.sim.day=d;g.sim.time=1019;g=advanceGame(g,2);}
  g.sim.day=3;g.sim.time=1019.5;
  const errors=await boot(page,g);await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect(page.getByRole('button',{name:'缺勤记录需要复核',exact:true})).toBeVisible();
  expect((await state(page)).budget).toBe(g.budget);
  await page.getByRole('button',{name:'缺勤记录需要复核',exact:true}).click();
  await page.getByRole('button',{name:'接受解除任职，重新求职',exact:true}).click();
  expect((await state(page)).career.jobId).toBeNull();expect(errors).toEqual([]);
});
test('new urban ground and soft window spill render on desktop and mobile',async({page})=>{
  const g=fresh();g.sim.time=1250;
  const errors=await boot(page,g);await pause(page);
  await page.getByRole('button',{name:'查看街景',exact:true}).click();await page.waitForTimeout(900);
  const d=await diag(page);expect(d.residence.streets.parks).toBe(5);expect(d.residence.streets.roads).toBe(4);
  expect(d.residence.windowSpill.every(l=>l.penumbra===1&&l.intensity>0)).toBe(true);
  await page.screenshot({path:'.runtime/daily-neighborhood-night.png'});
  const pixels=await page.evaluate(()=>window.__sunny.diagnostics().samples);
  expect(new Set(pixels.map(p=>p.join(','))).size).toBeGreaterThan(2);
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'回到家园视角',exact:true}).click();await page.waitForTimeout(700);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const rects=await page.evaluate(()=>['.resident-panel','.time-controls'].map(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
  expect(rects[0].bottom).toBeLessThanOrEqual(rects[1].top);
  await page.screenshot({path:'.runtime/daily-neighborhood-mobile.png'});
  expect(errors).toEqual([]);
});

test('three-person party charges once, arrives as a group and persists the visit',async({page})=>{
  test.setTimeout(90000);
  const g=fresh(),errors=await boot(page,g);
  await openSocial(page);
  await page.getByRole('checkbox',{name:'阿遥',exact:true}).check();
  await page.getByRole('checkbox',{name:'陈雨',exact:true}).check();
  await page.getByRole('button',{name:'邀请聚会 · 60 币',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.social.visit?.stage),{timeout:15000}).toBe('active');
  expect((await state(page)).budget).toBe(g.budget-60);
  expect((await diag(page)).guests).toHaveLength(3);
  await pause(page);await page.screenshot({path:'.runtime/daily-party.png'});
  await page.locator('.save-status').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  expect((await diag(page)).guests).toHaveLength(3);
  expect((await state(page)).budget).toBe(g.budget-60);
  expect(errors).toEqual([]);
});

test('quiet sofa rest shows tranquility and its actual emotional source',async({page})=>{
  const errors=await boot(page,fresh());
  await page.getByRole('button',{name:'室内剖面',exact:true}).click();await page.waitForTimeout(650);
  const pos=await page.evaluate(()=>window.__sunny.project(-3.4,.9,.1));
  await page.mouse.click(pos.x,pos.y);await page.getByRole('button',{name:'坐下休息',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect(page.locator('[data-mood]')).toHaveText('宁静',{timeout:15000});
  await pause(page);await page.getByRole('button',{name:'查看情绪来源',exact:true}).click();
  await expect(page.locator('.mood-sources')).toContainText('独处休息');
  await page.screenshot({path:'.runtime/daily-mood.png'});
  expect(errors).toEqual([]);
});
