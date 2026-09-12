import {test,expect} from '@playwright/test';
import {newGame} from '../../src/game.js';

test.setTimeout(process.env.CI?120000:60000);
const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
async function boot(page,avatar={},setup) {
  const game=newGame();game.sim.autonomy=false;game.sim.needs.hygiene=60;game.avatar={...game.avatar,...avatar};
  setup?.(game);
  await page.addInitScript(game=>localStorage.setItem('sunny-life.save.v1',JSON.stringify(game)),game);
  await page.goto(process.env.CI?'/?quality=low':'/');
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:process.env.CI?45000:10000});
  await page.waitForTimeout(600);
}
async function use(page,id,label) {
  const point=await page.evaluate(id=>{
    const f=window.__sunny.state().game.home.furniture.find(f=>f.id===id);
    return window.__sunny.project(f.x,f.type==='kitchen'?1.3:1,f.z);
  },id);
  await page.mouse.click(point.x,point.y);
  await page.getByRole('button',{name:label,exact:true}).click();
}

test('bed entry and reverse exit keep real hips anchored and feet grounded',async({page})=>{
  await boot(page);
  await use(page,'bed-1','睡个好觉');
  const seen=new Set(), samples=[];
  await expect.poll(()=>diag(page).then(d=>d.activity?.bedTime),{timeout:15000,intervals:[80]}).toBeGreaterThan(0);
  for(let i=0;i<80;i++) {
    const d=await diag(page);samples.push(d);seen.add(d.activity?.stage);
    if(['bed-sit','bed-legs','bed-recline'].includes(d.activity?.stage)&&!samples.slice(0,-1).some(s=>s.activity.stage===d.activity.stage)) {
      await page.screenshot({path:`test-results/${d.activity.stage}.png`});
    }
    if(d.activity?.stage==='active')break;
    await page.waitForTimeout(110);
  }
  expect([...seen]).toEqual(expect.arrayContaining(['bed-sit','bed-legs','bed-recline','active']));
  for(const d of samples) {
    const pose=d.activity.bedPose;
    expect(Math.hypot(...d.resident.hips.map((v,i)=>v-pose.hip[['x','y','z'][i]]))).toBeLessThan(.001);
    if(pose.legs===0)for(const foot of d.resident.feet)expect(Math.abs(foot[1]-.34)).toBeLessThan(.035);
  }
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const paused=await diag(page);
  await page.waitForTimeout(300);
  expect((await diag(page)).resident.hips).toEqual(paused.resident.hips);
  await page.screenshot({path:'test-results/bed-sleep.png'});
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await page.getByRole('button',{name:'继续生活',exact:true}).click();
  await expect(page.getByRole('button',{name:'暂停生活',exact:true})).toBeVisible();
  const exit=new Set();
  for(let i=0;i<80;i++) {
    const d=await diag(page);if(!d.activity)break;
    exit.add(d.activity.stage);
    if(d.activity.stage==='bed-stand')for(const foot of d.resident.feet)expect(Math.abs(foot[1]-.34)).toBeLessThan(.035);
    await page.waitForTimeout(140);
  }
  expect([...exit]).toEqual(expect.arrayContaining(['bed-rise','bed-lower','bed-stand']));
  expect((await diag(page)).activity).toBeNull();
  expect((await diag(page)).coverVisible).toBe(false);
});

for(const height of [.85,1.15])test(`kitchen handwashing aligns both hands, pauses, cancels at height ${height}`,async({page})=>{
  await boot(page,{height,build:height===.85?.8:1.3});
  await use(page,'kitchen-1','洗手');
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:15000}).toBe('active');
  const samples=[];
  for(let i=0;i<12;i++) {
    await page.waitForTimeout(300);
    const d=await diag(page);samples.push(d);
  }
  expect(samples.some(d=>d.handwashing.flow>.9)).toBe(true);
  expect(samples.some(d=>d.handwashing.foam>.5)).toBe(true);
  for(const d of samples) {
    expect(Math.max(...d.resident.washDistances)).toBeLessThan(.02);
    for(const foot of d.resident.feet)expect(Math.abs(foot[1]-(.25+.09*height))).toBeLessThan(.02);
  }
  await page.screenshot({path:`test-results/handwashing-${height}.png`});
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const paused=await diag(page);
  await page.waitForTimeout(400);
  expect((await diag(page)).handwashing).toEqual(paused.handwashing);
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await page.getByRole('button',{name:'继续生活',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity)).toBeNull();
  expect((await diag(page)).handwashing).toBeNull();
});

test('handwashing completes all phases and leaves no running water',async({page})=>{
  await boot(page);
  await use(page,'kitchen-1','洗手');
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:15000}).toBe('active');
  const phases=new Set();
  for(let i=0;i<100;i++) {
    const d=await diag(page);
    if(!d.activity)break;
    phases.add(d.handwashing.phase);
    await page.waitForTimeout(250);
  }
  expect([...phases]).toEqual(expect.arrayContaining(['tap-on','soap','rub','rinse','tap-off','dry']));
  expect((await diag(page)).handwashing).toBeNull();
  expect(await page.evaluate(()=>window.__sunny.state().game.sim.needs.hygiene)).toBeGreaterThan(62);
});

test('bed contacts remain continuous for rotated beds, both sides and extreme heights',async({page})=>{
  await boot(page);
  const report=await page.evaluate(async()=>{
    const {createResidentModel,loadResidentAssets}=await import('/src/characters.js');
    const {bedPoseAt}=await import('/src/bed-motion.js');
    const {planSleep,localPoint}=await import('/src/interactions.js');
    const {navigationGrid}=await import('/src/game.js');
    const {sleepCoverHeight}=await import('/src/activity-props.js');
    const {Vector3,Quaternion}=await import('/node_modules/three/build/three.module.js');
    await loadResidentAssets();
    const results=[];
    for(const height of [.85,1.15])for(const rotation of [0,Math.PI/2])for(const side of [-1,1]) {
      const game=window.__sunny.state().game,bed={...game.home.furniture.find(f=>f.type==='bed'),x:0,z:0,rotation};
      const home={...game.home,walls:[],furniture:[bed]};
      const plan=planSleep(home,bed,localPoint(bed,side*2,0),navigationGrid(home),height);
      const root=createResidentModel({...game.avatar,height,build:height===.85?.8:1.3}),anim=root.userData.controller;
      let last, displacement=0,footError=0,contactError=0,footSlide=0,fixedFeet;
      for(let frame=0;frame<=300;frame++) {
        const pose=bedPoseAt(frame/60,plan,height);
        anim.update(1/60);anim.bedPose(pose);
        const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),pose.yaw)
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2*pose.recline));
        anim.anchorHips(new Vector3(pose.hip.x,pose.hip.y,pose.hip.z),q);
        const hips=anim.point('Hips'),feet=['L','R'].map(s=>anim.point(`Foot_${s}`));
        if(last)displacement=Math.max(displacement,hips.distanceTo(last));
        last=hips;
        contactError=Math.max(contactError,hips.distanceTo(new Vector3(pose.hip.x,pose.hip.y,pose.hip.z)));
        if(!pose.legs) {
          for(const foot of feet)footError=Math.max(footError,Math.abs(foot.y-(plan.floor+.09*height)));
          if(!fixedFeet)fixedFeet=feet;
          for(let i=0;i<2;i++)footSlide=Math.max(footSlide,Math.hypot(feet[i].x-fixedFeet[i].x,feet[i].z-fixedFeet[i].z));
        }
      }
      anim.sleepWear(true);
      let penetration=0;
      root.traverse(mesh=>{
        if(!mesh.isMesh)return;
        for(let p=mesh;p;p=p.parent)if(!p.visible)return;
        for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
          const p=mesh.localToWorld(mesh.getVertexPosition(i,new Vector3()));
          const v=p.clone().sub(new Vector3(bed.x,plan.floor,bed.z)).applyAxisAngle(new Vector3(0,1,0),-rotation);
          v.x-=plan.side*.5;
          if(Math.abs(v.x)<.5&&v.z>-.5&&v.z<1.3)penetration=Math.max(penetration,v.y-sleepCoverHeight(v.x,v.z,height));
        }
      });
      results.push({height,rotation,side,chosen:plan.side,displacement,footError,footSlide,contactError,penetration});
      anim.dispose();
    }
    return results;
  });
  for(const r of report) {
    expect(r.chosen).toBe(r.side);
    expect(r.contactError).toBeLessThan(.001);
    expect(r.displacement).toBeLessThan(.04);
    expect(r.footError).toBeLessThan(.025);
    expect(r.footSlide).toBeLessThan(.025);
    expect(r.penetration).toBeLessThan(.008);
  }
});

test('coastal horizon blends into sky in low perspective and mobile views',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await boot(page);
  await page.getByLabel('镜头设置',{exact:true}).click();
  for(let i=0;i<5;i++)await page.getByRole('button',{name:'降低视角',exact:true}).click();
  await page.getByRole('button',{name:'透视镜头',exact:true}).click();
  await page.getByLabel('镜头设置',{exact:true}).click();
  for(let i=0;i<8;i++)await page.getByRole('button',{name:'缩小视角',exact:true}).click();
  await page.waitForTimeout(700);
  await page.screenshot({path:'test-results/horizon-desktop.png'});
  expect((await diag(page)).environment.ocean.extent).toBe(4000);
  const pixels=await page.evaluate(()=>window.__sunny.diagnostics().samples);
  expect(new Set(pixels.map(p=>p.join(','))).size).toBeGreaterThan(2);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/horizon-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

for(const stage of ['bed-sit','bed-legs','bed-recline'])test(`cancelling during ${stage} reverses from the current pose without a jump`,async({page})=>{
  await boot(page);
  await use(page,'bed-1','睡个好觉');
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:20000,intervals:[60]}).toBe(stage);
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  const before=await diag(page);
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  const after=await diag(page);
  expect(after.resident.hips).toEqual(before.resident.hips);
  expect(after.postureUp).toEqual(before.postureUp);
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>diag(page).then(d=>d.activity),{timeout:10000}).toBeNull();
  expect((await diag(page)).coverVisible).toBe(false);
});

test('standalone sink is usable on mobile and editing removes all wash effects',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await boot(page,{},game=>{
    game.home.furniture=[{id:'sink-test',type:'sink',x:0,z:0,rotation:Math.PI/2,color:'#bfd0c8'}];
  });
  await use(page,'sink-test','洗手');
  await expect.poll(()=>diag(page).then(d=>d.handwashing?.phase),{timeout:20000}).toBe('rub');
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  await page.screenshot({path:'test-results/sink-mobile.png'});
  await page.getByRole('button',{name:'建造',exact:true}).click();
  expect((await diag(page)).handwashing).toBeNull();
  const point=await page.evaluate(()=>window.__sunny.project(0,1.1,0));
  await page.mouse.click(point.x,point.y);
  await page.getByRole('button',{name:'收回',exact:true}).click();
  expect((await diag(page)).furniture.some(f=>f.id==='sink-test')).toBe(false);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  expect((await diag(page)).furniture.some(f=>f.id==='sink-test')).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test('queued handwashing waits for bed exit before starting',async({page})=>{
  await boot(page);
  await use(page,'bed-1','睡个好觉');
  await expect.poll(()=>diag(page).then(d=>d.activity?.stage),{timeout:20000}).toBe('active');
  await page.getByRole('button',{name:'暂停生活',exact:true}).click();
  await page.getByRole('button',{name:'回到家园视角',exact:true}).click();
  await page.waitForTimeout(700);
  await use(page,'kitchen-1','洗手');
  expect((await diag(page)).queue[0].label).toBe('洗手');
  await page.getByRole('button',{name:'取消当前活动',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  expect((await diag(page)).activity.type).toBe('sleep');
  await expect.poll(()=>diag(page).then(d=>d.activity?.type),{timeout:15000}).toBe('washHands');
  expect((await diag(page)).coverVisible).toBe(false);
  await expect.poll(()=>diag(page).then(d=>d.activity),{timeout:20000}).toBeNull();
  expect((await diag(page)).handwashing).toBeNull();
});
