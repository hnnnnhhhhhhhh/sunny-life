import { test, expect } from '@playwright/test';
import { newGame } from '../../src/game.js';

test.setTimeout(process.env.CI ? 120000 : 60000);
const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
async function boot(page,avatar={}) {
  const game=newGame();
  game.avatar={...game.avatar,...avatar};
  game.sim.autonomy=false;
  await page.addInitScript(game=>localStorage.setItem('sunny-life.save.v1',JSON.stringify(game)),game);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:process.env.CI?45000:10000});
  await page.waitForTimeout(800);
}

test('shoulder width changes only the upper body while every outfit remains usable',async({page})=>{
  await boot(page);
  const results=await page.evaluate(async()=>{
    const {createResidentModel,loadResidentAssets}=await import('/src/characters.js');
    const asset=await loadResidentAssets();
    if(!asset.loaded)throw new Error(asset.error||'Resident model did not load');
    const {Vector3}=await import('/node_modules/three/build/three.module.js');
    const avatar=window.__sunny.state().game.avatar, results=[];
    for(const base of ['female','male'])for(const outfit of ['shirt','jacket','cardigan'])for(const build of [0.8,1.3]) {
      const root=createResidentModel({...avatar,base,outfit,build});
      const controller=root.userData.controller;
      const points=[];
      root.traverse(node=>{
        if(!node.isMesh||(node.userData.role||node.parent?.userData.role)!=='Skin')return;
        for(let ancestor=node;ancestor;ancestor=ancestor.parent)if(!ancestor.visible)return;
        for(let i=0;i<node.geometry.attributes.position.count;i++) {
          const p=node.localToWorld(node.getVertexPosition(i,new Vector3()));
          if(p.y>1.90&&p.y<2.05)points.push(p.x);
        }
      });
      results.push({base,outfit,build,shoulder:controller.point('UpperArm_R').distanceTo(controller.point('UpperArm_L')),
        feet:controller.point('Foot_R').distanceTo(controller.point('Foot_L')),
        hips:controller.point('Thigh_R').distanceTo(controller.point('Thigh_L')),
        face:Math.max(...points)-Math.min(...points)});
      controller.dispose();
    }
    return results;
  });
  for(let i=0;i<results.length;i+=2) {
    const [narrow,broad]=results.slice(i,i+2);
    expect(broad.shoulder/narrow.shoulder).toBeCloseTo(1.3/0.8,3);
    expect(broad.feet).toBeCloseTo(narrow.feet,4);
    expect(broad.hips).toBeCloseTo(narrow.hips,4);
    expect(broad.face).toBeCloseTo(narrow.face,4);
  }
});

test('new proportions render at front, side, back and phone wardrobe views',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await boot(page);
  await page.getByRole('button',{name:'角色',exact:true}).click();
  await page.waitForTimeout(900);
  await page.screenshot({path:'test-results/resident-proportions-front.png'});
  await page.getByRole('button',{name:'面部特写',exact:true}).click();
  await page.waitForTimeout(900);
  await page.screenshot({path:'test-results/resident-proportions-shoulders.png'});
  for(let i=0;i<2;i++) {
    await page.getByRole('button',{name:'旋转角色视角',exact:true}).click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({path:'test-results/resident-proportions-side.png'});
  for(let i=0;i<2;i++) {
    await page.getByRole('button',{name:'旋转角色视角',exact:true}).click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({path:'test-results/resident-proportions-back.png'});
  await page.getByRole('button',{name:'全身视角',exact:true}).click();
  await page.getByRole('tab',{name:'穿搭',exact:true}).click();
  for(const [outfit,name] of [['shirt','休闲衬衫'],['cardigan','针织开衫']]) {
    await page.getByRole('button',{name,exact:true}).click();
    await page.waitForTimeout(700);
    await page.screenshot({path:`test-results/resident-proportions-${outfit}.png`});
  }
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(700);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'test-results/resident-proportions-mobile.png'});
  expect(errors).toEqual([]);
});

for(const avatar of [
  {base:'female',height:0.85,build:0.8,outfit:'shirt'},
  {base:'male',height:1.15,build:1.3,outfit:'cardigan'},
])test(`resized arms reach plate and mouth at ${avatar.height} height and ${avatar.build} shoulder width`,async({page})=>{
  await boot(page,avatar);
  const point=await page.evaluate(()=>window.__sunny.project(3.2,1.1,-1.4));
  await page.mouse.click(point.x,point.y);
  await page.getByRole('button',{name:'枫糖松饼',exact:true}).click();
  await page.getByRole('button',{name:/^开始用餐/}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:20000}).toBe('active');
  const distances=[];
  for(let i=0;i<12;i++) {
    await page.waitForTimeout(240);
    const d=await diag(page);
    distances.push(d.resident.targetDistance);
    for(const foot of d.resident.feet)expect(Math.abs(foot[1]-(0.25+0.09*avatar.height))).toBeLessThan(0.05);
  }
  expect(Math.max(...distances.filter(value=>value!==null))).toBeLessThan(0.095);
  await page.screenshot({path:`test-results/resident-proportions-eating-${avatar.base}.png`});
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity)).toBeNull();
  expect((await diag(page)).mealVisible).toBe(false);
});
