import {test,expect} from '@playwright/test';
import {newGame,newApartmentGame} from '../../src/game.js';
test.setTimeout(process.env.CI?120000:60000);
const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
async function boot(page,seed=newApartmentGame()) {
  seed.sim.autonomy=false;
  await page.addInitScript(g=>{if(!localStorage.getItem('sunny-life.save.v1'))localStorage.setItem('sunny-life.save.v1',JSON.stringify(g));},seed);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:45000});
  await page.waitForTimeout(1000);
}
async function clickWorld(page,x,y,z) {
  const p=await page.evaluate(p=>window.__sunny.project(...p),[x,y,z]);
  await page.mouse.click(p.x,p.y);
}
async function use(page,id,label) {
  const f=await page.evaluate(id=>window.__sunny.state().game.home.furniture.find(f=>f.id===id),id);
  await clickWorld(page,f.x,f.type==='tv'?1.5:1.05,f.z);
  await page.getByRole('button',{name:label,exact:true}).click();
}

test('apartment interior, entire building and mobile render without blank canvas or overlaps',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await boot(page);
  expect((await diag(page)).residence.style).toBe('urban-apartment');
  await page.screenshot({path:'test-results/apartment-interior.png'});
  await page.getByRole('button',{name:'整栋公寓',exact:true}).click();
  await page.waitForTimeout(800);
  expect((await diag(page)).residence.exterior).toBe(true);
  await page.screenshot({path:'test-results/apartment-building.png'});
  await page.getByRole('button',{name:'室内剖面',exact:true}).click();
  await page.waitForTimeout(800);
  expect((await diag(page)).residence.exterior).toBe(false);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'回到家园视角',exact:true}).click();
  await page.waitForTimeout(800);
  await page.screenshot({path:'test-results/apartment-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const pixels=await page.evaluate(()=>window.__sunny.diagnostics().samples);
  expect(new Set(pixels.map(p=>p.join(','))).size).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

for(const [id,label,type] of [
  ['tv-1','自然纪录片','watch'],['bed-1','睡个好觉','sleep'],
  ['shower-1','洗澡','shower'],['toilet-1','上厕所','toilet'],['sink-1','洗手','washHands'],
])test(`apartment ${type} remains reachable and cleans up after cancellation`,async({page})=>{
  await boot(page);
  await use(page,id,label);
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:30000,intervals:[150]}).toBe('active');
  const d=await diag(page);expect(d.activity.type).toBe(type);
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  await page.screenshot({path:`test-results/apartment-${type}.png`});
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity),{timeout:15000}).toBeNull();
  const ended=await diag(page);
  expect(ended.coverVisible).toBe(false);expect(ended.bathroom).toBeNull();expect(ended.handwashing).toBeNull();
});

test('moving homes preserves the existing decoration and can be reversed after reload',async({page})=>{
  const old=newGame();old.budget=16000;old.home.furniture[0].color='#abcdef';
  await boot(page,old);
  await page.getByRole('button',{name:'搬入公寓',exact:true}).click();
  await page.getByRole('button',{name:'确认搬入公寓',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.residence.style)).toBe('urban-apartment');
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.world-loading')).toHaveCount(0);
  await page.getByRole('button',{name:'切换住宅',exact:true}).click();
  await page.getByRole('button',{name:'返回海岸住宅',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.residence.style)).toBe('coastal');
  const restored=await page.evaluate(()=>window.__sunny.state().game);
  expect(restored.home).toEqual(old.home);expect(restored.budget).toBe(16000);
});

test('balcony and shared corridor are walkable but apartment rails stay inside the floor',async({page})=>{
  await boot(page);
  for(const [name,z] of [['阳台',5.5],['公共走廊',-1.5]]) {
    await page.getByRole('button',{name:'浏览公寓户型',exact:true}).click();
    await page.getByRole('button',{name:`前往${name}`,exact:true}).click();
    await page.getByRole('button',{name:'3倍速',exact:true}).click();
    await expect.poll(()=>diag(page).then(d=>d.position[2]),{timeout:15000}).toBeCloseTo(z,0);
    await expect.poll(()=>diag(page).then(d=>d.pathLength)).toBe(0);
  }
  expect((await diag(page)).neighbors).toEqual([]);
  await page.getByRole('tab',{name:'社交',exact:true}).click();
  await page.getByRole('button',{name:'网上聊天',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:15000}).toBe('active');
  expect((await diag(page)).activity.type).toBe('onlineChat');
});

test('apartment editing protects shell and corridor, clears only the fit-out and supports undo',async({page})=>{
  await boot(page);
  await page.getByRole('button',{name:'建造',exact:true}).click();
  await page.getByRole('button',{name:'拆除家具或墙体',exact:true}).click();
  await page.waitForTimeout(700);
  await clickWorld(page,-6,2,-.7);
  expect((await diag(page)).walls.some(w=>w.id==='exterior-west')).toBe(true);
  await page.getByRole('button',{name:'房屋属性',exact:true}).click();
  await page.getByRole('button',{name:'清空套内装修',exact:true}).click();
  await page.getByRole('button',{name:'确认清空套内',exact:true}).click();
  expect((await diag(page)).furniture).toHaveLength(0);
  expect((await diag(page)).walls).toHaveLength(4);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  expect((await diag(page)).furniture).toHaveLength(17);
  expect((await diag(page)).walls).toHaveLength(7);
  await page.getByRole('button',{name:'选择家具',exact:true}).click();
  await page.getByRole('button',{name:'展开家具目录',exact:true}).click();
  await page.getByRole('button',{name:'放置一盆龟背竹',exact:true}).click();
  await clickWorld(page,7.2,.25,1.5);
  expect((await diag(page)).furniture).toHaveLength(17);
  await expect(page.getByRole('status',{name:'游戏通知'})).toContainText('公共走廊');
  await clickWorld(page,0,.25,5.5);
  await expect.poll(()=>diag(page).then(d=>d.furniture.length)).toBe(18);
});

test('new residents live in apartments and can eat in the new kitchen layout',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0);
  await page.getByRole('textbox',{name:'居民姓名',exact:true}).fill('公寓小满');
  await page.getByRole('button',{name:'开始生活',exact:true}).click();
  await page.waitForTimeout(900);
  expect((await diag(page)).residence.style).toBe('urban-apartment');
  await clickWorld(page,3.2,1.1,-1.4);
  await page.getByRole('button',{name:/^开始用餐/}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:20000}).toBe('active');
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  expect((await diag(page)).resident.targetDistance).toBeLessThan(.09);
  expect((await diag(page)).mealVisible).toBe(true);
  await page.screenshot({path:'test-results/apartment-dining.png'});
});
