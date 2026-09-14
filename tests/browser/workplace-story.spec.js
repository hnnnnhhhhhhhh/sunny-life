import {test,expect} from '@playwright/test';
import {newApartmentGame,advanceGame} from '../../src/game.js';
import {careerAction} from '../../src/career.js';
const state=page=>page.evaluate(()=>window.__sunny.state().game);
const diag=page=>page.evaluate(()=>window.__sunny.diagnostics({pixels:false}));
function start(jobId='assistant'){
  let g=newApartmentGame();g.sim.time=540;g.sim.autonomy=false;
  g.career.qualification=1000;g.career.highestRank=3;
  Object.keys(g.sim.needs).forEach(k=>g.sim.needs[k]=100);
  g=careerAction(g,{kind:'hire',jobId});
  return advanceGame(careerAction(g,{kind:'depart'}),3);
}
const act=(g,value)=>careerAction(g,{kind:'workplace',value});
async function boot(page,g){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(g=>{if(!localStorage.getItem('sunny-life.save.v1'))localStorage.setItem('sunny-life.save.v1',JSON.stringify(g));},g);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  return errors;
}
async function pause(page){
  const b=page.getByRole('button',{name:'暂停生活',exact:true});if(await b.count())await b.click();
}
async function careerTab(page){
  const b=page.getByRole('button',{name:'展开居民面板',exact:true});if(await b.count())await b.click();
  await page.getByRole('tab',{name:'职业',exact:true}).click();
}
async function workCenter(page){
  await careerTab(page);await page.getByRole('button',{name:'职场事务与人物',exact:true}).click();
}
async function save(page){
  await page.getByRole('button',{name:'存档管理',exact:true}).click();
  await page.getByRole('button',{name:/保存到浏览器/}).click();
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
}
for(const [jobId,names] of [['assistant',['蛋宝']],['specialist',['蛋宝','水姐','桌哥']],['manager',['蛋宝','水姐','桌哥','大眼贼']]]){
  test(`${jobId} renders only its unlocked animated NPC cast`,async({page})=>{
    test.setTimeout(90000);
    const errors=await boot(page,start(jobId));await pause(page);
    await expect.poll(()=>diag(page).then(d=>d.workplace.people.map(n=>n.name))).toEqual(names);
    expect((await diag(page)).workplace.people.every(n=>n.bones===29)).toBe(true);
    await page.waitForTimeout(700);
    const colors=await page.evaluate(()=>{
      const canvas=document.querySelector('[data-testid="world-canvas"]'),gl=canvas.getContext('webgl2');
      const colors=new Set(),pixel=new Uint8Array(4);
      for(let x=.25;x<.76;x+=.04)for(let y=.25;y<.76;y+=.04){
        gl.readPixels(Math.floor(x*canvas.width),Math.floor(y*canvas.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        colors.add([...pixel].join(','));
      }
      return colors.size;
    });
    expect(colors).toBeGreaterThan(25);
    await page.screenshot({path:`.runtime/workplace-${jobId}.png`});
    await workCenter(page);await page.getByRole('button',{name:'人物与交接',exact:true}).click();
    expect(await page.locator('.work-people-list button strong').allTextContents()).toEqual(names);
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
    const before=(await diag(page)).workplace.people[0];
    const point=await page.evaluate(pos=>window.__sunny.project(pos[0],2.78,pos[2]),before.position);
    await page.mouse.click(point.x,point.y);
    await expect(page.getByRole('dialog',{name:'职场事务'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'蛋宝',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('interruptions stop production, choices consume time and cannot be applied twice after reload',async({page})=>{
  const g=advanceGame(start(),44),errors=await boot(page,g);
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect(page.locator('.work-notice')).toBeVisible();
  await pause(page);
  await page.locator('.work-notice').click();
  const before=await state(page);
  await page.screenshot({path:'.runtime/workplace-event.png'});
  await page.getByRole('button',{name:/给出 A\/B 选项/}).click();
  const chosen=await state(page);
  expect(chosen.career.workplace.event).toBeNull();
  expect(chosen.career.workplace.project.evidence).toBe(20);
  expect(chosen.career.workplace.project.required).toBe(345);
  expect(chosen.career.workplace.project.done).toBe(before.career.workplace.project.done);
  expect(chosen.career.workplace.project.overhead).toBe(15);
  await save(page);await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});await pause(page);
  expect((await state(page)).career.workplace.project.evidence).toBe(20);
  expect((await state(page)).career.workplace.event).toBeNull();
  await workCenter(page);
  await expect(page.getByRole('progressbar',{name:'项目完成度'})).toHaveAttribute('max','345');
  expect(errors).toEqual([]);
});

test('a reported large-company project triggers the first boss chapter with real support',async({page})=>{
  let g=start('manager');
  g=advanceGame(g,30);g=act(g,{kind:'report'});
  g=advanceGame(g,15);g=act(g,{kind:'resolve',eventId:g.career.workplace.event.id,choiceId:'options'});
  g=advanceGame(g,60);g=act(g,{kind:'report'});
  g=advanceGame(g,51);g=act(g,{kind:'resolve',eventId:g.career.workplace.event.id,choiceId:'contract'});
  g=advanceGame(g,124);
  expect(g.career.workplace.event.type).toBe('vision');
  const errors=await boot(page,g);await pause(page);await page.locator('.work-notice').click();
  await expect(page.getByRole('dialog',{name:'主线 · 有眼光'})).toBeVisible();
  const before=(await state(page)).career.workplace.project.done;
  await page.getByRole('button',{name:/按小范围试点推进/}).click();
  expect((await state(page)).career.workplace.project.done).toBe(before+60);
  expect((await state(page)).career.workplace.bossStage).toBe(1);
  await workCenter(page);await page.getByRole('button',{name:'主线与记录',exact:true}).click();
  await page.screenshot({path:'.runtime/workplace-story.png'});
  await expect(page.locator('.work-journal')).toContainText('真实获得 60 分钟资源支持');
  expect(errors).toEqual([]);
});
test('handoff is promised first and actual artifact must be accepted exactly once',async({page})=>{
  test.setTimeout(90000);
  let g=start();g=act(g,{kind:'handoff',npcId:'danbao',task:'small'});g=advanceGame(g,38);
  const errors=await boot(page,g);await pause(page);
  await workCenter(page);await page.getByRole('button',{name:'人物与交接',exact:true}).click();
  await expect(page.getByText('已口头答应，尚未交付',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'验收交接产物',exact:true})).toBeDisabled();
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect.poll(()=>state(page).then(g=>g.career.workplace.npcs.danbao.assignment.status)).toBe('done');
  await pause(page);await workCenter(page);await page.getByRole('button',{name:'人物与交接',exact:true}).click();
  const before=(await state(page)).career.workplace.project.done;
  await page.getByRole('button',{name:'验收交接产物',exact:true}).click();
  expect((await state(page)).career.workplace.project.done).toBe(before+30);
  await expect(page.getByRole('button',{name:'验收交接产物',exact:true})).toBeDisabled();
  await page.screenshot({path:'.runtime/workplace-handoff.png'});
  expect(errors).toEqual([]);
});
test('mobile workplace tabs, people and event choices fit the viewport',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:390,height:844});
  const errors=await boot(page,advanceGame(start('manager'),45));await pause(page);
  await page.locator('.work-notice').click();
  await page.screenshot({path:'.runtime/workplace-mobile-event.png'});
  expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth===el.clientWidth)).toBe(true);
  await page.getByRole('button',{name:/给出 A\/B 选项/}).click();
  await workCenter(page);await page.getByRole('button',{name:'人物与交接',exact:true}).click();
  await page.screenshot({path:'.runtime/workplace-mobile-people.png'});
  const boxes=await page.locator('.work-people-list button').evaluateAll(els=>els.map(el=>{
    const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:el.scrollWidth,client:el.clientWidth};
  }));
  expect(boxes.every(b=>b.left>=0&&b.right<=390&&b.width===b.client)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});
test('dismissal review preserves salary, changes mood and allows finding a new job',async({page})=>{
  test.setTimeout(90000);
  let g=start();
  for(let i=0;i<3;i++){
    g=advanceGame(g,650);
    if(i<2){g.sim.day++;g.sim.time=540;Object.keys(g.sim.needs).forEach(k=>g.sim.needs[k]=100);g.career.stress=0;g=careerAction(g,{kind:'depart'});}
  }
  expect(g.career.workplace.event.type).toBe('appraisal');
  Object.keys(g.sim.needs).forEach(k=>g.sim.needs[k]=100);
  const money=g.budget,errors=await boot(page,g);await pause(page);
  await page.locator('.work-notice').click();
  await expect(page.getByRole('dialog',{name:'绩效复核'})).toBeVisible();
  await expect(page.getByRole('button',{name:/提交依赖与打断记录/})).toBeDisabled();
  await page.getByRole('button',{name:/接受解除任职/}).click();
  expect((await state(page)).career.jobId).toBeNull();
  expect((await state(page)).budget).toBe(money);
  await expect(page.locator('[data-mood]')).toHaveText('失业后的失落');
  await save(page);await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  await careerTab(page);
  await page.getByRole('button',{name:'从电脑查找工作',exact:true}).click();
  await page.getByRole('button',{name:'3倍速',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'青禾招聘'})).toBeVisible({timeout:25000});
  await page.getByRole('article').filter({has:page.getByRole('heading',{name:/视觉设计师/})}).getByRole('button',{name:'选择并入职',exact:true}).click();
  expect((await state(page)).career.jobId).toBe('designer');
  expect((await state(page)).budget).toBe(money);
  expect(errors).toEqual([]);
});
