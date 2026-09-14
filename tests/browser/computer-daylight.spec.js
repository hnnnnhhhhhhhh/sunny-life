import {test,expect} from '@playwright/test';
import {newApartmentGame,newGame} from '../../src/game.js';
test.setTimeout(process.env.CI?120000:60000);

const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
async function boot(page,game=newApartmentGame()) {
  game.sim.autonomy=false;game.sim.needs.social=20;
  await page.addInitScript(g=>localStorage.setItem('sunny-life.save.v1',JSON.stringify(g)),game);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:45000});
  await expect.poll(()=>diag(page).then(d=>!!d.resident)).toBe(true);
}

test('computer conversation sits, types, animates its screen, pauses and cancels',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);
  expect((await diag(page)).neighbors).toEqual([]);
  await page.getByRole('tab',{name:'社交',exact:true}).click();
  await page.getByRole('button',{name:'网上聊天',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:30000,intervals:[100]}).toBe('active');
  await expect(page.getByRole('dialog',{name:'邻里日常'})).toBeVisible();
  await page.getByRole('dialog',{name:'邻里日常'}).getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const start=await diag(page);
  expect(start.activity.type).toBe('onlineChat');
  expect(start.computers[0].playing).toBe(true);
  expect(start.resident.hips[1]).toBeGreaterThan(.8);
  expect(start.resident.hips[1]).toBeLessThan(1);
  expect(Math.max(...start.resident.washDistances)).toBeLessThan(.035);
  await page.waitForTimeout(500);
  const paused=await diag(page);
  expect(paused.computers[0].time).toBe(start.computers[0].time);
  expect(paused.resident.palms).toEqual(start.resident.palms);
  await page.screenshot({path:'test-results/computer-typing.png'});
  await page.getByRole('button',{name:'继续生活',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.computers[0].checksum),{timeout:5000}).not.toBe(start.computers[0].checksum);
  await expect.poll(()=>page.evaluate(()=>window.__sunny.state().game.sim.needs.social)).toBeGreaterThan(20);
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity)).toBeNull();
  expect((await diag(page)).computers[0].playing).toBe(false);
  expect(errors).toEqual([]);
});

for(const [phase,time] of [['day',720],['dusk',1130],['night',1320],['dawn',365]]) {
  test(`clock-driven ${phase} has visible geometry and usable desktop/mobile lighting`,async({page})=>{
    const game=newApartmentGame();game.sim.time=time;
    await boot(page,game);
    await page.getByRole('button',{name:'暂停生活',exact:true}).click();
    const light=(await diag(page)).lighting;
    expect(light.phase).toBe(phase);
    if(phase==='night'){
      expect(light.sun).toBeLessThan(.3);
      expect(light.fixtures.some(l=>l.intensity>1)).toBe(true);
    }
    await page.waitForTimeout(700);
    await page.screenshot({path:`test-results/apartment-${phase}.png`});
    const pixels=await page.evaluate(()=>window.__sunny.diagnostics().samples);
    expect(new Set(pixels.map(p=>p.join(','))).size).toBeGreaterThan(3);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'回到家园视角',exact:true}).click();
    await page.waitForTimeout(700);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({path:`test-results/apartment-${phase}-mobile.png`});
  });
}

test('coast night darkens the water and studio lighting remains neutral',async({page})=>{
  const game=newGame();game.sim.time=1320;
  await boot(page,game);
  expect((await diag(page)).environment.ocean.daylight).toBe(0);
  await page.getByRole('button',{name:`编辑${game.avatar.name}`,exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.lighting.sun)).toBeGreaterThan(3);
  await page.screenshot({path:'test-results/resident-new-full.png'});
});

test('time advancement drives sunset and freezes with pause',async({page})=>{
  const game=newApartmentGame();game.sim.time=1199.5;
  await page.clock.install();
  await boot(page,game);
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await page.clock.runFor(1500);
  expect((await diag(page)).lighting.phase).toBe('night');
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const paused=(await diag(page)).lighting;
  await page.clock.fastForward(4000);
  expect((await diag(page)).lighting).toEqual(paused);
});

test('computer completion advances the queue and mode changes turn the screen off',async({page})=>{
  await boot(page);
  await page.getByRole('tab',{name:'社交',exact:true}).click();
  await page.getByRole('button',{name:'网上聊天',exact:true}).click();
  await page.getByRole('button',{name:'网上聊天',exact:true}).click();
  await expect(page.getByRole('region',{name:'任务队列'})).toBeVisible();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:30000}).toBe('active');
  await expect(page.getByRole('dialog',{name:'邻里日常'})).toBeVisible();
  await page.getByRole('dialog',{name:'邻里日常'}).getByRole('button',{name:'关闭',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.queue.length),{timeout:30000}).toBe(0);
  await expect.poll(()=>diag(page).then(d=>d.computers[0].playing),{timeout:15000}).toBe(true);
  await page.getByRole('button',{name:'建造',exact:true}).click();
  expect((await diag(page)).activity).toBeNull();
  expect((await diag(page)).computers[0].playing).toBe(false);
});

test('typing reaches the keyboard for both bodies, extreme sizes and rotated desks',async({page})=>{
  await boot(page);
  const results=await page.evaluate(async()=>{
    const {createResidentModel,loadResidentAssets}=await import('/src/characters.js');
    const {typingTargets,COMPUTER}=await import('/src/computer.js');
    const {localPoint}=await import('/src/interactions.js');
    await loadResidentAssets();
    const values=[];
    for(const base of ['female','male'])for(const height of [.85,1.15])for(const rotation of [0,Math.PI/2]) {
      const avatar={...window.__sunny.state().game.avatar,base,height,build:height===.85?.8:1.3};
      const root=createResidentModel(avatar),anim=root.userData.controller,fixture={x:0,z:0,rotation};
      const seat=localPoint(fixture,0,COMPUTER.seatZ);
      root.position.set(seat.x,.25+anim.seatOffset(COMPUTER.seatTop),seat.z);
      root.rotation.y=rotation+Math.PI;anim.play('SitIdle',0);
      anim.update(.1,1,COMPUTER.seatTop);
      anim.typingPose(typingTargets(fixture,.25,3),3);
      values.push({base,height,rotation,distances:anim.diagnostics().washDistances,feet:anim.diagnostics().feet});
      anim.dispose();
    }
    return values;
  });
  for(const result of results) {
    expect(Math.max(...result.distances)).toBeLessThan(.035);
    for(const foot of result.feet)expect(Math.abs(foot[1]-(.25+.09*result.height))).toBeLessThan(.05);
  }
});

test('old apartment without a computer exposes placement without overwriting decoration',async({page})=>{
  const game=newApartmentGame();game.home.furniture=game.home.furniture.filter(f=>f.type!=='desk');
  game.home.furniture[0].color='#abcdef';
  await boot(page,game);
  await page.getByRole('tab',{name:'社交',exact:true}).click();
  await page.getByRole('button',{name:'放置电脑桌',exact:true}).click();
  expect((await diag(page)).mode).toBe('build');
  const p=await page.evaluate(()=>window.__sunny.project(0,.25,2));
  await page.mouse.click(p.x,p.y);
  await expect.poll(()=>diag(page).then(d=>d.computers.length)).toBe(1);
  expect(await page.evaluate(()=>window.__sunny.state().game.home.furniture[0].color)).toBe('#abcdef');
});
