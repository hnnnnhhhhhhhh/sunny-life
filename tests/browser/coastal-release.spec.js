import { test, expect } from '@playwright/test';
import { newGame } from '../../src/game.js';
import { finishOnboarding } from './helpers.js';

test.setTimeout(process.env.CI ? 120000 : 60000);
const diag=page=>page.evaluate(()=>window.__sunny.diagnostics());
const game=page=>page.evaluate(()=>window.__sunny.state().game);
async function boot(page,seed) {
  if(seed) await page.addInitScript(seed=>{
    if(!localStorage.getItem('sunny-life.save.v1')) localStorage.setItem('sunny-life.save.v1',JSON.stringify(seed));
  },seed);
  await page.goto(process.env.CI ? '/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:process.env.CI?45000:10000});
  await page.waitForTimeout(800);
}
async function furniture(page,id,label) {
  const p=await page.evaluate(id=>{
    const f=window.__sunny.state().game.home.furniture.find(f=>f.id===id);
    return window.__sunny.project(f.x,f.type==='tv'?1.5:0.9,f.z);
  },id);
  await page.mouse.click(p.x,p.y);
  await page.getByRole('button',{name:label,exact:true}).click();
}

test('new visitors create their own resident, resume, and do not share saves',async({page,browser})=>{
  await boot(page);
  await expect(page.getByRole('button',{name:'开始生活',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('sunny-life.save.v1'))).toBeNull();
  const time=(await game(page)).sim.time;
  await page.getByRole('button',{name:'开始生活',exact:true}).click();
  await expect(page.getByRole('status',{name:'游戏通知'})).toContainText('名字');
  expect((await game(page)).sim.time).toBe(time);
  await page.getByRole('textbox',{name:'居民姓名'}).fill('海边小满');
  await page.getByRole('button',{name:'开始生活',exact:true}).click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload(); await expect(page.locator('.world-loading')).toHaveCount(0);
  await expect(page.locator('.resident strong')).toHaveText('海边小满');
  const siteURL=page.url();
  await page.close();
  const second=await browser.newContext({viewport:{width:390,height:844}});
  const other=await second.newPage(); await other.goto(siteURL,{waitUntil:'domcontentloaded'});
  await expect(other.locator('.world-loading')).toHaveCount(0);
  await expect(other.getByRole('button',{name:'开始生活',exact:true})).toBeVisible();
  await other.screenshot({path:'test-results/new-resident-mobile.png'});
  await second.close();
});

test('TV restores fun during viewing and queued toilet waits until it finishes',async({page})=>{
  const seed=newGame(); seed.sim.autonomy=false; seed.sim.needs.fun=25; seed.sim.needs.bladder=20;
  await boot(page,seed);
  await furniture(page,'tv-1','看一会儿电影');
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:15000}).toBe('active');
  const before=(await game(page)).sim.needs.fun;
  await page.waitForTimeout(1400);
  expect((await game(page)).sim.needs.fun).toBeGreaterThan(before+1);
  expect((await diag(page)).activity.type).toBe('watch');
  await page.getByRole('button',{name:'回到家园视角',exact:true}).click();
  await page.waitForTimeout(800);
  await furniture(page,'toilet-1','上厕所');
  expect((await diag(page)).activity.type).toBe('watch');
  expect((await diag(page)).queue[0].targetId).toBe('toilet-1');
  await expect(page.getByRole('region',{name:'任务队列'})).toContainText('上厕所');
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const paused=await game(page), progress=(await diag(page)).activity.progress;
  await page.waitForTimeout(700);
  expect((await game(page)).sim.needs).toEqual(paused.sim.needs);
  expect((await diag(page)).activity.progress).toBe(progress);
  await page.screenshot({path:'test-results/tv-toilet-queue.png'});
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.type),{timeout:20000}).toBe('toilet');
  expect((await diag(page)).televisions[0].playing).toBe(false);
  expect((await diag(page)).queue).toHaveLength(0);
  await expect.poll(()=>diag(page).then(d=>d.activity),{timeout:15000}).toBeNull();
  expect((await game(page)).sim.needs.bladder).toBeGreaterThan(80);
});

test('queue can reorder, remove, clear and cancellation retains earned benefits',async({page})=>{
  const seed=newGame(); seed.sim.autonomy=false; seed.sim.needs.fun=20;
  await boot(page,seed);
  await furniture(page,'tv-1','看一会儿电影');
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:15000}).toBe('active');
  await page.getByRole('button',{name:'回到家园视角',exact:true}).click(); await page.waitForTimeout(800);
  await furniture(page,'toilet-1','上厕所');
  await furniture(page,'bed-1','睡个好觉');
  await page.getByRole('button',{name:'提前睡个好觉',exact:true}).click();
  expect((await diag(page)).queue[0].targetId).toBe('bed-1');
  await page.getByRole('button',{name:'移除待办睡个好觉',exact:true}).click();
  expect((await diag(page)).queue).toHaveLength(1);
  await page.getByRole('button',{name:'清空待办队列',exact:true}).click();
  const partial=(await game(page)).sim.needs.fun;
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity)).toBeNull();
  expect((await game(page)).sim.needs.fun).toBeGreaterThan(20);
  expect((await game(page)).sim.needs.fun).toBeLessThan(partial+1);
});

test('fishing reaches shore, casts, reels, collects a fish and resumes queued actions',async({page})=>{
  const seed=newGame(); seed.sim.autonomy=false;
  await boot(page,seed);
  await page.getByRole('button',{name:'钓鱼与鱼获'}).click();
  await page.getByRole('button',{name:'橡树湾',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.fishing?.phase),{timeout:20000}).toBe('wait');
  await page.getByRole('button',{name:'1倍速',exact:true}).click();
  const d=await diag(page);
  expect(d.position[0]).toBeCloseTo(-4,1);
  expect(d.fishing.bobber[1]).toBeLessThan(-0.8);
  await page.screenshot({path:'test-results/coastal-fishing.png'});
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const paused=(await diag(page)).fishing;
  await page.waitForTimeout(500);
  expect((await diag(page)).fishing).toEqual(paused);
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>game(page).then(g=>g.sim.catches.length),{timeout:15000}).toBe(1);
  expect((await diag(page)).fishing).toBeNull();
  await page.getByRole('button',{name:'钓鱼与鱼获'}).click();
  await expect(page.locator('.catch-collection')).toContainText('银鳞鱼');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.keyboard.press('Meta+s');
  await page.reload(); await expect(page.locator('.world-loading')).toHaveCount(0);
  expect((await game(page)).sim.catches).toHaveLength(1);
});

test('low-poly coast and reflective water render without GPU errors on desktop and mobile',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await boot(page,newGame());
  const d=await diag(page);
  await expect.poll(()=>diag(page).then(d=>d.environment.ocean.reflectedFrames)).toBeGreaterThan(3);
  expect(d.environment.grass.style).toBe('low-poly');
  expect(d.environment.grass.blades).toBeLessThan(1000);
  await page.waitForTimeout(1000);
  expect((await diag(page)).environment.waterSamples).not.toEqual(d.environment.waterSamples);
  await page.screenshot({path:'test-results/coast-desktop.png'});
  await page.getByLabel('镜头设置',{exact:true}).click();
  await page.getByRole('button',{name:'透视镜头',exact:true}).click();
  await page.getByLabel('镜头设置',{exact:true}).click();
  await page.waitForTimeout(500);
  await page.screenshot({path:'test-results/coast-perspective.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  expect(new Set((await diag(page)).samples.map(p=>p.join(','))).size).toBeGreaterThan(3);
  await page.screenshot({path:'test-results/coast-mobile.png'});
  expect(errors).toEqual([]);
});
