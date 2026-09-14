import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {newApartmentGame} from '../../src/game.js';

const localModel=existsSync('.runtime/refined-resident/manifest.json');
const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
async function boot(page,{refined=false,time=624}={}){
  const game=newApartmentGame();game.sim.autonomy=false;game.sim.time=time;
  await page.addInitScript(g=>{
    if(!localStorage.getItem('sunny-life.save.v1'))localStorage.setItem('sunny-life.save.v1',JSON.stringify(g));
  },game);
  await page.goto(`/?${refined?'resident=refined&':''}${process.env.CI?'quality=low':''}`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:60000});
  return game;
}
async function use(page,id,label){
  if(id==='desk-1'){
    await page.getByRole('tab',{name:'社交',exact:true}).click();
    await page.getByRole('button',{name:label,exact:true}).click();
    await page.getByRole('button',{name:'3倍速',exact:true}).click();
    return;
  }
  await page.getByRole('button',{name:'回到家园视角',exact:true}).click();
  await page.waitForTimeout(800);
  const point=await page.evaluate(id=>{
    const f=window.__sunny.state().game.home.furniture.find(f=>f.id===id);
    return window.__sunny.project(f.x,1.05,f.z);
  },id);
  await page.mouse.click(point.x,point.y);
  if(id==='dining-1'){
    await page.getByRole('button',{name:'枫糖松饼',exact:true}).click();
    await page.getByRole('button',{name:/^开始用餐/}).click();
  }else await page.getByRole('button',{name:label,exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
}

test('interior PBR maps render and preserve old furniture and colors',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const game=await boot(page);
  expect((await diag(page)).surfaces.loaded).toEqual(['oak','linen','plaster','stone','brick']);
  const properties=await page.evaluate(async()=>{
    const {furnitureModel}=await import('/src/models.js');
    const {loadBlenderModels}=await import('/src/model-assets.js');
    const {loadSurfaceAssets}=await import('/src/surfaces.js');
    await loadSurfaceAssets();await loadBlenderModels();
    const model=furnitureModel('chair','#739486'),result=[];
    model.traverse(mesh=>{
      if(mesh.material?.userData.surface)result.push({surface:mesh.material.userData.surface,
        map:!!mesh.material.map,normal:!!mesh.material.normalMap,rough:!!mesh.material.roughnessMap,
        uv:!!mesh.geometry.attributes.uv,color:mesh.material.color.getHexString(),name:mesh.material.name});
    });
    return result;
  });
  expect(properties.length).toBeGreaterThan(2);
  expect(properties.every(p=>p.map&&p.normal&&p.rough&&p.uv)).toBe(true);
  expect(properties.find(p=>p.name.startsWith('Dye_Main')).color).toBe('739486');
  await page.locator('.save-status').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sunny-life.save.v1')).home)).toEqual(game.home);
  await page.screenshot({path:'test-results/refined-interior-day.png'});
  expect(errors).toEqual([]);
});

test('supplied mesh visibly deforms and hairstyle and color variants keep their textures',async({page})=>{
  test.skip(!localModel,'The user-provided model is intentionally local-only.');
  await boot(page,{refined:true});
  const result=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {loadResidentAssets,createResidentModel}=await import('/src/characters.js');
    await loadResidentAssets();
    const avatar=window.__sunny.state().game.avatar;
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(1600,650);renderer.setScissorTest(true);renderer.toneMapping=T.ACESFilmicToneMapping;
    const data=[];
    for(const [i,hair] of ['bob','short','bun','curly'].entries()){
      const model=createResidentModel({...avatar,hair,skin:i%2?'#ca9571':'#e5b896',
        hairColor:i%2?'#974f43':'#75523a',top:i%2?'#81a7b8':'#739486'});
      const controller=model.userData.controller,scene=new T.Scene();
      scene.background=new T.Color('#e1e7e3');scene.add(model);
      scene.add(new T.HemisphereLight('#f8faff','#798273',1.4));
      const sun=new T.DirectionalLight('#fff1dd',2.4);sun.position.set(-3,5,4);scene.add(sun);
      const target=new T.Vector3(0,1.78,.01),camera=new T.OrthographicCamera(-.38,.38,.62,-.62,.01,20);
      camera.position.copy(target).add(new T.Vector3(.4,.05,4));camera.lookAt(target);
      let skin;
      model.traverse(m=>{if(m.isSkinnedMesh&&m.userData.base==='female'&&m.userData.role==='Skin')skin=m;});
      const original=skin.getVertexPosition(0,new T.Vector3());
      controller.play('SitIdle',0);controller.update(1,1);
      let movement=0;
      for(let j=0;j<skin.geometry.attributes.position.count;j+=17){
        const local=new T.Vector3().fromBufferAttribute(skin.geometry.attributes.position,j);
        movement=Math.max(movement,local.distanceTo(skin.getVertexPosition(j,new T.Vector3())));
      }
      data.push({hair,movement,map:!!skin.material.map,normalCount:skin.geometry.attributes.normal.count,finite:original.toArray().every(Number.isFinite)});
      controller.play('Idle',0);controller.update(.1);
      renderer.setViewport(i*400,0,400,650);renderer.setScissor(i*400,0,400,650);
      renderer.render(scene,camera);controller.dispose();
    }
    const image=renderer.domElement.toDataURL();renderer.dispose();return {data,image};
  });
  for(const row of result.data){
    expect(row.movement).toBeGreaterThan(.25);
    expect(row.map&&row.finite).toBe(true);
    expect(row.normalCount).toBeGreaterThan(1000);
  }
  await writeFile('test-results/refined-variants.png',Buffer.from(result.image.split(',')[1],'base64'));
});

test('supplied resident edits persist through the real character editor and reload',async({page})=>{
  test.skip(!localModel,'The user-provided model is intentionally local-only.');
  await boot(page,{refined:true});
  await page.getByRole('button',{name:'角色',exact:true}).click();
  await page.getByRole('button',{name:'肤色 3',exact:true}).click();
  await page.getByRole('tab',{name:'穿搭',exact:true}).click();
  await page.getByRole('button',{name:'上衣颜色 4',exact:true}).click();
  await page.getByRole('switch',{name:'圆框眼镜',exact:true}).click();
  await page.getByRole('button',{name:'完成形象',exact:true}).click();
  await page.locator('.save-status').click();
  const edited=await page.evaluate(()=>JSON.parse(localStorage.getItem('sunny-life.save.v1')).avatar);
  expect(edited.skin).toBe('#ca9571');expect(edited.top).toBe('#81a7b8');expect(edited.glasses).toBe(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:60000});
  expect(await page.evaluate(()=>window.__sunny.state().game.avatar)).toEqual(edited);
  expect((await diag(page)).resident.artist).toContain('Mrs_Afton');
});

for(const [id,label,type] of [
  ['kitchen-1','洗手','washHands'],['toilet-1','上厕所','toilet'],
  ['bed-1','睡个好觉','sleep'],['desk-1','网上聊天','onlineChat'],
  ['dining-1','开始用餐','eat'],['shower-1','洗澡','shower'],
]){
  test(`supplied resident performs ${type}, pauses and clears its real pose`,async({page})=>{
    test.skip(!localModel,'The user-provided model is intentionally local-only.');
    test.setTimeout(90000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await boot(page,{refined:true});
    expect((await diag(page)).resident.artist).toContain('Mrs_Afton');
    await use(page,id,label);
    await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:30000,intervals:[100]}).toBe('active');
    if(type==='onlineChat'){
      await expect(page.getByRole('dialog',{name:'邻里日常'})).toBeVisible();
      await page.getByRole('dialog',{name:'邻里日常'}).getByRole('button',{name:'关闭',exact:true}).click();
    }
    await page.getByRole('button',{name:'暂停生活',exact:true}).click();
    const paused=await diag(page);
    expect(paused.activity.type).toBe(type);
    if(type==='washHands'||type==='onlineChat')expect(Math.max(...paused.resident.washDistances)).toBeLessThan(.04);
    if(type==='sleep')expect(paused.postureUp[1]).toBeLessThan(.02);
    if(type==='eat'){
      expect(paused.mealVisible).toBe(true);
      expect(paused.resident.targetDistance).toBeLessThan(.09);
    }
    if(type==='toilet'||type==='onlineChat')expect(paused.resident.hips[1]).toBeLessThan(1);
    await page.waitForTimeout(300);
    expect((await diag(page)).resident.hips).toEqual(paused.resident.hips);
    await page.screenshot({path:`test-results/refined-${type}.png`});
    await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
    await page.getByRole('button',{name:'继续生活',exact:true}).click();
    await expect.poll(()=>diag(page).then(d=>d.activity),{timeout:15000}).toBeNull();
    const done=await diag(page);
    expect(done.coverVisible).toBe(false);expect(done.handwashing).toBeNull();
    expect(done.mealVisible).toBe(false);expect(done.bathroom).toBeNull();
    expect(done.postureUp[1]).toBeGreaterThan(.99);
    expect(errors).toEqual([]);
  });
}

for(const refined of [false,true])test(`night mobile stays visible with ${refined?'supplied':'CC0'} resident`,async({page})=>{
  test.skip(refined&&!localModel,'The user-provided model is intentionally local-only.');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await boot(page,{refined,time:1320});
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  await page.screenshot({path:`test-results/refined-night-${refined}.png`});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'收起居民面板',exact:true}).click();
  await page.getByRole('button',{name:'回到家园视角',exact:true}).click();
  await page.waitForTimeout(800);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const samples=await page.evaluate(()=>window.__sunny.diagnostics().samples);
  expect(new Set(samples.map(p=>p.join(','))).size).toBeGreaterThan(3);
  await page.screenshot({path:`test-results/refined-mobile-${refined}.png`});
  expect(errors).toEqual([]);
});
