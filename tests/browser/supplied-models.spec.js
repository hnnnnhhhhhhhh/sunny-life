import {test,expect} from '@playwright/test';
import {newApartmentGame,newGame} from '../../src/game.js';

test.setTimeout(process.env.CI?120000:60000);
const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
async function boot(page,game=newApartmentGame()) {
  game.sim.autonomy=false;
  await page.addInitScript(g=>{
    if(!localStorage.getItem('sunny-life.save.v1'))localStorage.setItem('sunny-life.save.v1',JSON.stringify(g));
  },game);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:45000});
  await expect.poll(()=>diag(page).then(d=>!!d.resident)).toBe(true);
  await page.waitForTimeout(700);
}
async function use(page,id,label) {
  await page.getByRole('button',{name:'回到家园视角',exact:true}).click();
  await page.waitForTimeout(800);
  const point=await page.evaluate(id=>{
    const f=window.__sunny.state().game.home.furniture.find(f=>f.id===id);
    return window.__sunny.project(f.x,1.05,f.z);
  },id);
  await page.mouse.click(point.x,point.y);
  await page.getByRole('button',{name:label,exact:true}).click();
}

for(const home of ['apartment','coast'])test(`replacement models preserve the ${home} save and actually render`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const game=home==='apartment'?newApartmentGame():newGame();
  const original=structuredClone(game.home),budget=game.budget;
  await boot(page,game);
  const d=await diag(page);
  expect(d.assets.supplied.failed).toEqual({});
  expect(d.assets.supplied.loaded.sort()).toEqual(['fridge','kitchen','plumbob','sink','toilet']);
  for(const furniture of d.furniture.filter(f=>['kitchen','fridge','sink','toilet'].includes(f.type)))
    expect(furniture.source).toBe('supplied');
  expect(d.marker.source).toBe('supplied');
  expect(await page.evaluate(()=>window.__sunny.state().game.home)).toEqual(original);
  expect(await page.evaluate(()=>window.__sunny.state().game.budget)).toBe(budget);
  const pixels=await page.evaluate(()=>window.__sunny.diagnostics().samples);
  expect(new Set(pixels.map(p=>p.join(','))).size).toBeGreaterThan(3);
  await page.screenshot({path:`test-results/supplied-${home}.png`});
  expect(errors).toEqual([]);
});

test('both imported basins retain flowing water, hand contact, pause and cancel cleanup',async({page})=>{
  await boot(page);
  for(const id of ['kitchen-1','sink-1']) {
    await use(page,id,'洗手');
    await page.getByRole('button',{name:'3倍速',exact:true}).click();
    await expect.poll(()=>diag(page).then(d=>d.handwashing?.phase),{timeout:35000,intervals:[100]}).toBe('rub');
    await page.getByRole('button',{name:'暂停生活',exact:true}).click();
    const active=await diag(page),fixture=active.furniture.find(f=>f.id===id);
    expect(active.handwashing.flow).toBeGreaterThan(.9);
    expect(Math.max(...active.resident.washDistances)).toBeLessThan(.035);
    expect(fixture.parts.TapHandle.rotation[2]).toBeLessThan(-.5);
    await page.screenshot({path:`test-results/supplied-wash-${id}.png`});
    await page.waitForTimeout(400);
    expect((await diag(page)).handwashing.time).toBe(active.handwashing.time);
    await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
    await page.getByRole('button',{name:'3倍速',exact:true}).click();
    await expect.poll(()=>diag(page).then(d=>d.activity),{timeout:15000}).toBeNull();
    const ended=await diag(page);
    expect(ended.handwashing).toBeNull();
    expect(ended.furniture.find(f=>f.id===id).parts.TapHandle.rotation[2]).toBeCloseTo(0,5);
  }
});

test('new toilet seats the resident and flushes only its handle before returning to rest',async({page})=>{
  const game=newApartmentGame();game.sim.needs.bladder=20;
  await boot(page,game);
  await use(page,'toilet-1','上厕所');
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:30000}).toBe('active');
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const active=await diag(page);
  expect(Math.abs(active.resident.hips[1]-(active.activity.floor+active.activity.seatTop+.07))).toBeLessThan(.035);
  await page.screenshot({path:'test-results/supplied-toilet.png'});
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  const motion=await page.evaluate(()=>new Promise((resolve,reject)=>{
    let maximum=0,bodyRotation=0;const deadline=performance.now()+30000;
    const sample=()=>{
      const d=window.__sunny.diagnostics({pixels:false}),parts=d.furniture.find(f=>f.id==='toilet-1').parts;
      maximum=Math.max(maximum,Math.abs(parts.FlushHandle.rotation[0]));
      bodyRotation=Math.max(bodyRotation,...parts.ToiletBody.rotation.map(Math.abs));
      if(!d.activity)return resolve({maximum,bodyRotation,rest:parts.FlushHandle.rotation[0]});
      if(performance.now()>deadline)return reject(new Error('Toilet did not complete'));
      requestAnimationFrame(sample);
    };
    sample();
  }));
  expect(motion.maximum).toBeGreaterThan(.05);
  expect(motion.bodyRotation).toBeLessThan(.001);
  expect(motion.rest).toBeCloseTo(0,5);
  expect(await page.evaluate(()=>window.__sunny.state().game.sim.needs.bladder)).toBeGreaterThan(70);
});

test('imported furniture can be recolored, rotated, removed, restored and reloaded',async({page})=>{
  const game=newApartmentGame();game.home.walls=[];
  game.home.furniture=[{id:'sink-1',type:'sink',x:0,z:0,rotation:0,color:'#bfd0c8'}];
  game.sim.x=2;game.sim.z=2;
  await boot(page,game);
  await page.getByRole('button',{name:'建造',exact:true}).click();
  const point=await page.evaluate(()=>window.__sunny.project(0,.9,0));
  await page.mouse.click(point.x,point.y);
  await page.getByRole('button',{name:'家具配色 2',exact:true}).click();
  expect((await diag(page)).furniture[0].dyes).toContain('edf1ed');
  await page.getByRole('button',{name:'旋转',exact:true}).click();
  await page.getByRole('button',{name:'收回',exact:true}).click();
  expect((await diag(page)).furniture).toHaveLength(0);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:45000});
  expect((await diag(page)).furniture[0].source).toBe('supplied');
  expect((await diag(page)).furniture[0].dyes).toContain('edf1ed');
});

for(const mode of ['native-glb','failed-pack'])test(`replacement delivery handles ${mode} without damaging saves`,async({page})=>{
  if(mode==='native-glb')await page.addInitScript(()=>{globalThis.DecompressionStream=undefined;});
  else await page.route('**/models/supplied/furnishings.glb.gz*',route=>route.abort());
  await boot(page);
  const d=await diag(page);
  expect(d.furniture.find(f=>f.type==='kitchen').source).toBe(mode==='native-glb'?'supplied':'procedural');
  expect(d.resident.source).toBe('blender-resident');
  expect(await page.evaluate(()=>window.__sunny.state().game.home.furniture.length)).toBe(17);
});

test('night mobile scene and visible asset credits remain accessible',async({page})=>{
  const game=newApartmentGame();game.sim.time=1320;
  await page.setViewportSize({width:390,height:844});
  await boot(page,game);
  expect((await diag(page)).assets.supplied.loaded).toHaveLength(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'test-results/supplied-mobile-night.png'});
  await page.getByRole('button',{name:'存档管理',exact:true}).click();
  const link=page.getByRole('link',{name:'素材鸣谢',exact:true});
  await expect(link).toBeVisible();
  const response=await page.request.get(await link.getAttribute('href'));
  expect(await response.text()).toContain('littledica');
});
