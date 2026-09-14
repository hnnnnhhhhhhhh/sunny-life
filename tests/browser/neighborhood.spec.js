import {test,expect} from '@playwright/test';
import {newApartmentGame} from '../../src/game.js';
const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
async function boot(page,options={}){
  const game=newApartmentGame();game.sim.autonomy=!!options.autonomy;
  if(options.healthy)for(const key in game.sim.needs)game.sim.needs[key]=95;
  if(options.time!==undefined)game.sim.time=options.time;
  await page.addInitScript(g=>{
    if(!localStorage.getItem('sunny-life.save.v1'))localStorage.setItem('sunny-life.save.v1',JSON.stringify(g));
  },game);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:60000});
  return game;
}
async function use(page,id,label){
  await page.getByRole('button',{name:'室内剖面',exact:true}).click();
  await page.waitForTimeout(900);
  const point=await page.evaluate(id=>{
    const f=window.__sunny.state().game.home.furniture.find(f=>f.id===id);
    return window.__sunny.project(f.x,f.type==='sofa'?.8:1.05,f.z);
  },id);
  await page.mouse.click(point.x,point.y);
  await page.getByRole('button',{name:label,exact:true}).click();
}

test('downloaded sofa has a real seat at the old contact height and accepts sitting',async({page})=>{
  await boot(page);
  expect((await diag(page)).furniture.find(f=>f.id==='sofa-1').source).toBe('neighborhood');
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {loadNeighborhoodAssets,createNeighborhoodModel}=await import('/src/neighborhood-assets.js');
    await loadNeighborhoodAssets();
    const sofa=createNeighborhoodModel('sofa','#739486');sofa.updateMatrixWorld(true);
    const hit=new T.Raycaster(new T.Vector3(0,2,.18),new T.Vector3(0,-1,0)).intersectObject(sofa,true)[0];
    const maps=[];sofa.traverse(n=>{if(n.material?.name==='Dye_Main_sofa')maps.push({normal:!!n.material.normalMap,ao:!!n.material.aoMap,color:n.material.color.getHexString()});});
    return {seatY:hit?.point.y,maps};
  });
  expect(Math.abs(geometry.seatY-.68)).toBeLessThan(.035);
  expect(geometry.maps[0]).toEqual({normal:true,ao:true,color:'739486'});
  await use(page,'sofa-1','坐下休息');
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:30000}).toBe('active');
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const d=await diag(page);
  for(const foot of d.resident.feet)expect(Math.abs(foot[1]-.34)).toBeLessThan(.04);
  await page.screenshot({path:'test-results/neighborhood-sofa-seat.png'});
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await page.getByRole('button',{name:'继续生活',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity)).toBeNull();
});

test('both street lanes have moving imported cars and freeze with game pause',async({page})=>{
  await boot(page);
  await page.getByRole('button',{name:'查看街景',exact:true}).click();
  await page.waitForTimeout(1000);
  const before=(await diag(page)).residence;
  expect(before.opposite).toHaveLength(7);expect(before.traffic.loaded).toBe(6);
  expect(before.traffic.cars.every(car=>car.wheels===4)).toBe(true);
  await page.waitForTimeout(1200);
  const after=(await diag(page)).residence.traffic;
  expect(after.time).toBeGreaterThan(before.traffic.time+.5);
  expect(after.cars[0].position).not.toEqual(before.traffic.cars[0].position);
  expect(after.cars[0].wheelAngle).not.toBe(before.traffic.cars[0].wheelAngle);
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const frozen=(await diag(page)).residence.traffic;
  await page.waitForTimeout(450);
  expect((await diag(page)).residence.traffic).toEqual(frozen);
  await page.screenshot({path:'test-results/neighborhood-street.png'});
});

test('curtain fabric morphs subtly without moving its rail and pauses with life',async({page})=>{
  await boot(page);
  const before=(await diag(page)).curtains;
  expect(before.length).toBeGreaterThan(2);
  await page.waitForTimeout(800);
  expect((await diag(page)).curtains).not.toEqual(before);
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const paused=(await diag(page)).curtains;
  await page.waitForTimeout(300);
  expect((await diag(page)).curtains).toEqual(paused);
});

test('healthy residents choose leisure and a manual toilet command takes priority',async({page})=>{
  await boot(page,{autonomy:true,healthy:true});
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.autonomy.active),{timeout:20000}).toBe(true);
  const leisure=(await diag(page)).activity.type;
  expect(['rest','watch','onlineChat']).toContain(leisure);
  await use(page,'toilet-1','上厕所');
  await expect.poll(()=>diag(page).then(d=>d.activity?.type),{timeout:20000}).toBe('toilet');
  expect((await diag(page)).autonomy.active).toBe(false);
  await page.getByRole('switch',{name:'自主照料',exact:true}).uncheck();
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity),{timeout:15000}).toBeNull();
});

test('background music outputs audio, mutes and remembers the selected volume',async({page})=>{
  await boot(page);
  await page.getByRole('button',{name:'播放背景音乐',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__sunnyMusic().peak),{intervals:[100],timeout:7000}).toBeGreaterThan(.001);
  await page.getByLabel('音乐音量设置',{exact:true}).click();
  const slider=page.getByRole('slider',{name:'音乐音量',exact:true});
  await slider.focus();await slider.press('Home');
  for(let i=0;i<22;i++)await slider.press('ArrowRight');
  expect(await page.evaluate(()=>window.__sunnyMusic().volume)).toBe(.22);
  await page.getByRole('button',{name:'关闭背景音乐',exact:true}).click();
  await page.waitForTimeout(450);
  expect(await page.evaluate(()=>window.__sunnyMusic().peak)).toBeLessThan(.0002);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:60000});
  expect(await page.evaluate(()=>window.__sunnyMusic().volume)).toBe(.22);
  await expect(page.getByRole('button',{name:'播放背景音乐',exact:true})).toBeVisible();
});

test('original score renders finite non-silent PCM with headroom',async({page})=>{
  await boot(page);
  const result=await page.evaluate(async()=>{
    const {scheduleBar,BAR_SECONDS}=await import('/src/music.js');
    const context=new OfflineAudioContext(1,Math.ceil((BAR_SECONDS*2+4)*22050),22050);
    scheduleBar(context,context.destination,0,0);
    scheduleBar(context,context.destination,BAR_SECONDS,1);
    const samples=(await context.startRendering()).getChannelData(0);
    let peak=0,sum=0,finite=true;
    for(const value of samples){finite&&=Number.isFinite(value);peak=Math.max(peak,Math.abs(value));sum+=value*value;}
    return {peak,rms:Math.sqrt(sum/samples.length),finite};
  });
  expect(result.finite).toBe(true);expect(result.peak).toBeLessThan(.9);expect(result.rms).toBeGreaterThan(.005);
});

test('new assets fail safely without losing the apartment save',async({page})=>{
  await page.route('**/models/neighborhood/neighborhood.glb*',route=>route.abort());
  const game=await boot(page);
  expect((await diag(page)).assets.neighborhood.error).toBeTruthy();
  expect((await diag(page)).furniture.find(f=>f.id==='sofa-1').source).toBe('blender');
  await page.locator('.save-status').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sunny-life.save.v1')).home)).toEqual(game.home);
});

test('night street and music controls fit a mobile viewport',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await boot(page,{time:1320});
  const collapse=page.getByRole('button',{name:'收起居民面板',exact:true});
  if(await collapse.count())await collapse.click();
  await page.getByRole('button',{name:'查看街景',exact:true}).click();
  await page.waitForTimeout(1200);
  expect((await diag(page)).residence.traffic.night).toBeGreaterThan(.9);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const boxes=await page.evaluate(()=>['.game-header','.mode-switch'].map(selector=>{
    const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right};
  }));
  expect(boxes[0].right).toBeLessThan(boxes[1].left);
  const samples=await page.evaluate(()=>window.__sunny.diagnostics().samples);
  expect(new Set(samples.map(p=>p.join(','))).size).toBeGreaterThan(3);
  await page.screenshot({path:'test-results/neighborhood-mobile-night.png'});
  expect(errors).toEqual([]);
});
