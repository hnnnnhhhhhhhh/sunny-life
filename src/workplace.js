import {castForRank,castById,newNpcState} from './workplace-cast.js';
import {WORK_EVENTS,STORY_EVENTS,PROJECT_TITLES} from './workplace-stories.js';

const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const now=sim=>(sim.day-1)*1440+sim.time;
export function newWorkplace(){
  return {supervisor:'danbao',performance:70,warnings:0,pipUsed:false,projects:0,bossStage:0,
    smallStory:false,midStory:false,lastBossProject:0,serial:0,project:null,event:null,
    npcs:newNpcState(),reviews:[],journal:[],dismissed:null,emotion:null};
}
export const workplaceFor=game=>game.career.workplace;
export const currentChapter=w=>w.bossStage?2+w.bossStage:w.midStory?2:w.smallStory?1:0;
export const completion=p=>p?Math.min(1,p.done/p.required):0;
function log(w,sim,npcId,text){
  w.journal=[...w.journal.slice(-59),{day:sim.day,time:sim.time,npcId,text}];
}
function clone(w){return {...w,project:w.project?{...w.project}:null,npcs:Object.fromEntries(Object.entries(w.npcs).map(([id,n])=>[id,{...n,assignment:n.assignment?{...n.assignment}:null}]))};}
export function beginProject(career,job,sim){
  const w=clone(career.workplace||newWorkplace());
  w.projects++;w.event=null;
  if(job.rank===1)w.supervisor='danbao';
  w.project={id:w.projects,day:sim.day,rank:job.rank,title:PROJECT_TITLES[(w.projects-1)%PROJECT_TITLES.length],
    required:360,done:0,quality:70,credit:100,evidence:0,communication:20,
    spent:0,focused:0,interrupted:0,overhead:0,overheadLabel:'',events:0,missed:0,
    lastReport:-60,requests:[],submitted:false,reviewed:false};
  for(const npc of castForRank(job.rank)){
    const n=w.npcs[npc.id];
    n.energy=clamp(n.energy+55);n.hunger=85;n.stress=clamp(n.stress-25);
    n.known=0;n.informed=npc.id===w.supervisor;n.assignment=null;
  }
  log(w,sim,w.supervisor,'下发主任务：预计 6 小时，截止到本班结束。');
  return {...career,workplace:w};
}
function issueEvent(w,type,npcId,sim){
  w.serial++;
  w.event={id:w.serial,type,npcId,at:now(sim),waited:0,projectId:w.project.id};
  w.npcs[npcId].informed=true;
  log(w,sim,npcId,`来讯：${WORK_EVENTS[type].title}`);
}
function chooseScheduledEvent(w,job){
  const p=w.project,slot=p.events;
  if(slot===0)return w.supervisor==='danbao'?['direction','danbao']:['meeting','shuijie'];
  if(slot===1){
    if(job.rank>=2&&w.npcs.shuijie.informed)return [p.id%2?'credit':'rework','shuijie'];
    return ['meeting',w.supervisor];
  }
  if(job.rank===3&&w.bossStage<5&&w.lastBossProject!==p.id&&w.npcs.dayanzei.informed&&w.npcs.dayanzei.known>=.2)
    return [STORY_EVENTS[w.bossStage],'dayanzei'];
  if(job.rank>=2&&w.npcs.zhuoge.informed&&w.npcs.zhuoge.known>=.2)return ['scale','zhuoge'];
  return ['urgent',w.supervisor];
}
function applyChoice(game,choice,ignored=false){
  const c=game.career,w=clone(c.workplace),event=w.event,p=w.project,n=w.npcs[event.npcId],e=choice.effects;
  let time=e.time||0,scope=e.scope||0;
  // High trust can shorten coordination, but it cannot erase ownership conflicts.
  if(n.trust>=65&&time>0)time=Math.max(5,time-5);
  if(event.type==='rework'&&choice.id==='record'&&p.evidence>=30)scope=0;
  p.overhead+=time;p.overheadLabel=WORK_EVENTS[event.type].title;
  p.required=clamp(p.required+scope,240,900);
  p.done=Math.min(p.required,p.done+(e.help||0));
  p.evidence=clamp(p.evidence+(e.evidence||0));
  p.communication=clamp(p.communication+(e.communication||0));
  p.quality=clamp(p.quality+(e.quality||0));
  p.credit=clamp(p.credit+(e.credit||0));
  n.trust=clamp(n.trust+(e.trust||0));n.closeness=clamp(n.closeness+(e.closeness||0));
  n.interest=clamp(n.interest+(e.help?8:0));n.known=completion(p);
  if(e.inform){w.npcs[e.inform].known=completion(p);w.npcs[e.inform].informed=true;}
  if(event.type==='direction')w.smallStory=true;
  if(['credit','rework','scale'].includes(event.type))w.midStory=true;
  if(e.arc){w.bossStage=Math.min(5,w.bossStage+1);w.lastBossProject=p.id;}
  if(ignored){p.missed++;p.communication=clamp(p.communication-8);}
  log(w,game.sim,event.npcId,`${ignored?'未回复，默认处理：':''}${choice.label}。${choice.outcome}`);
  w.event=null;
  return {...game,career:{...c,stress:clamp(c.stress+(e.stress||0)),workplace:w}};
}
export function workplaceAction(game,action,job){
  const c=game.career,source=c.workplace||newWorkplace(),p=source.project;
  if(action.kind==='resolve'){
    if(!source.event||source.event.id!==action.eventId)return game;
    if(source.event.type==='appraisal')return resolveAppraisal(game,action.choiceId);
    if(c.location!=='office'||p?.reviewed)return game;
    const choice=WORK_EVENTS[source.event.type]?.choices.find(v=>v.id===action.choiceId);
    return choice?applyChoice(game,choice):game;
  }
  if(action.kind==='supervisor'){
    if(!job||job.rank<2||c.location!=='home'||source.event||!['danbao','shuijie'].includes(action.npcId))return game;
    const w={...source,supervisor:action.npcId};
    log(w,game.sim,action.npcId,'下一次出勤起调整直属组长，另一位组长仍为跨组协作方。');
    return {...game,career:{...c,workplace:w}};
  }
  if(!job||c.location!=='office'||c.phase!=='working'||!p||p.reviewed||source.event||p.overhead>0)return game;
  if(['handoff','followup','collect'].includes(action.kind)&&!castForRank(job.rank).some(n=>n.id===action.npcId))return game;
  const w=clone(source),project=w.project;
  if(action.kind==='report'&&p.spent-p.lastReport>=60){
    project.lastReport=p.spent;project.overhead=10;project.overheadLabel='同步进度与依赖';
    project.communication=clamp(p.communication+20);project.evidence=clamp(p.evidence+15);
    for(const npc of castForRank(job.rank)){w.npcs[npc.id].known=completion(p);w.npcs[npc.id].informed=true;}
    log(w,game.sim,w.supervisor,'同步了演示、剩余范围与依赖；相关管理者现在知道这份进展。');
  }else if(action.kind==='handoff'){
    if(!castForRank(job.rank).some(n=>n.id===action.npcId)||!['small','complex'].includes(action.task)||
      p.requests.includes(action.npcId)||p.submitted)return game;
    const n=w.npcs[action.npcId],small=action.task==='small';
    if(['zhuoge','dayanzei'].includes(action.npcId)&&completion(p)<.2)return game;
    n.informed=true;n.known=completion(p);
    const tired=n.energy<40||n.hunger<35||n.stress>65;
    const delay=(action.npcId==='danbao'?(small?15:85)+(tired?35:0):
      action.npcId==='shuijie'?10:25)+(n.mood<35||n.interest<35?20:0);
    const duration=small?25:65,benefit=action.npcId==='dayanzei'?75:action.npcId==='zhuoge'?55:small?30:65;
    n.assignment={task:action.task,status:'promised',elapsed:0,delay,duration,benefit};
    project.requests=[...p.requests,action.npcId];project.overhead=5;project.overheadLabel='交接说明';
    log(w,game.sim,action.npcId,`口头接下${small?'明确的小任务':'开放式复杂任务'}，还没有实际产物。`);
  }else if(action.kind==='followup'){
    const n=w.npcs[action.npcId];
    if(!n?.assignment||n.assignment.status!=='promised'||p.requests.includes(`follow-${action.npcId}`))return game;
    project.requests=[...p.requests,`follow-${action.npcId}`];project.overhead=10;project.overheadLabel='确认交接时间';
    n.assignment.delay=Math.min(n.assignment.delay,n.assignment.elapsed+5);
    project.evidence=clamp(p.evidence+15);
    log(w,game.sim,action.npcId,'追问具体交付时间并给出选项，缩短等待，但仍需完成实际工作。');
  }else if(action.kind==='collect'){
    const n=w.npcs[action.npcId];
    if(!n?.assignment||n.assignment.status!=='done'||!p.requests.includes(action.npcId)||p.submitted)return game;
    project.done=Math.min(p.required,p.done+n.assignment.benefit);
    project.overhead=5;project.overheadLabel='验收交接产物';
    if(action.npcId==='shuijie'&&p.evidence<25)project.credit=clamp(p.credit-15);
    n.assignment.status='collected';n.trust=clamp(n.trust+5);
    log(w,game.sim,action.npcId,'实际产物已验收，计入主任务进展。');
  }else if(action.kind==='submit'&&!p.submitted&&completion(p)>=.6){
    project.submitted=true;project.overhead=10;project.overheadLabel='提交验收';
    project.communication=clamp(p.communication+10);
    for(const npc of castForRank(job.rank)){w.npcs[npc.id].known=completion(p);w.npcs[npc.id].informed=true;}
    log(w,game.sim,w.supervisor,`提交本次版本，完成度 ${Math.round(completion(p)*100)}%。`);
  }else return game;
  return {...game,career:{...c,workplace:w}};
}
export function advanceWorkplace(game,minutes,job){
  let next=game,c=game.career;
  if(!c.workplace)return game;
  const w=clone(c.workplace),p=w.project;
  if(w.emotion){w.emotion={...w.emotion,remaining:Math.max(0,w.emotion.remaining-minutes)};if(!w.emotion.remaining)w.emotion=null;}
  if(c.location!=='office'||!p||p.reviewed)return {...game,career:{...c,workplace:w}};
  for(const npc of castForRank(job.rank)){
    const n=w.npcs[npc.id],resting=n.energy<25||n.hunger<25;
    n.energy=clamp(n.energy+minutes*(resting?.5:-.035));n.hunger=clamp(n.hunger+minutes*(resting?.8:-.065));
    n.stress=clamp(n.stress+minutes*(resting?-.2:.012));n.mood=clamp(n.mood+minutes*(resting?.08:-n.stress*.0003));
    if(n.assignment?.status==='promised'){
      const a=n.assignment;
      a.elapsed+=minutes*(resting?.2:n.trust>65?1.15:1);
      if(a.elapsed>=a.delay+a.duration){a.status='done';log(w,game.sim,npc.id,'交接有了实际产物，等待你验收。');}
    }
  }
  if(c.phase==='working'){
    p.spent+=minutes;
    if(w.event){p.interrupted+=minutes;w.event={...w.event,waited:w.event.waited+minutes};}
    else if(p.overhead>0){const used=Math.min(minutes,p.overhead);p.overhead-=used;p.interrupted+=used;}
    else if(!p.submitted){p.focused+=minutes;p.done=Math.min(p.required,p.done+minutes*(c.stress>80?.8:1));}
    const due=[45,140+(p.id%3)*15,260+(p.id%2)*20][p.events];
    if(!w.event&&!p.submitted&&p.events<3&&p.spent>=due){
      const [type,npcId]=chooseScheduledEvent(w,job);p.events++;issueEvent(w,type,npcId,game.sim);
    }
  }
  next={...game,career:{...c,workplace:w}};
  if(w.event&&w.event.waited>=30){
    const def=WORK_EVENTS[w.event.type];
    next=applyChoice(next,def.choices.find(v=>v.id===def.fallback),true);
  }
  return next;
}
export function assessProject(game,job,reason){
  const c=game.career;
  if(!c.workplace?.project||c.workplace.project.reviewed)return game;
  const w=clone(c.workplace),p=w.project;
  const finish=completion(p),healthExit=reason==='身体需要休息';
  const score=Math.round(clamp(finish*65+p.quality*.15+p.communication*.12+p.evidence*.08-
    p.missed*4-(100-p.credit)*.06-(p.submitted?0:8)));
  p.reviewed=true;w.event=null;w.performance=Math.round(w.performance*.55+score*.45);
  const poor=score<60;
  if(poor&&!healthExit)w.warnings=Math.min(3,w.warnings+1);
  else if(score>=75)w.warnings=Math.max(0,w.warnings-1);
  const risk=poor&&!healthExit&&w.warnings>=3&&w.performance<55;
  const feedback=poor?'“主动性、积极性和完成度都还不够。”管理者把问题归到执行环节。':
    score>=80?'交付与过程记录完整，本次项目获得认可。':'交付基本达标，仍需改进同步和验收记录。';
  const review={projectId:p.id,day:game.sim.day,score,completion:Math.round(finish*100),evidence:p.evidence,
    communication:p.communication,credit:p.credit,interrupted:Math.round(p.interrupted),healthExit,risk,appealed:false,
    outcome:risk?'待申诉':poor&&!healthExit?'绩效警告':healthExit?'健康原因离岗':'保留任职',feedback};
  w.reviews=[...w.reviews.slice(-19),review];
  w.emotion={kind:poor?'reprimand':'recognition',remaining:poor?720:240};
  log(w,game.sim,job.rank>=2?'zhuoge':w.supervisor,`项目评审 ${score} 分。${feedback}${healthExit?' 本次健康离岗不累计警告。':''}`);
  return {...game,sim:{...game.sim,needs:{...game.sim.needs,fun:clamp(game.sim.needs.fun+(poor?-14:6))}},
    career:{...c,stress:clamp(c.stress+(poor?12:-5)),workplace:w}};
}
export function prepareAppraisal(career,sim){
  const source=career.workplace,review=source?.reviews.at(-1);
  if(!review?.risk||review.appealed||source.event||source.dismissed?.day===sim.day)return career;
  const w={...source,serial:source.serial+1,event:{id:source.serial+1,type:'appraisal',npcId:source.supervisor,at:now(sim),waited:0,projectId:review.projectId}};
  return {...career,workplace:w};
}
export function appraisalChoices(game){
  const w=game.career.workplace,r=w.reviews.at(-1);
  return [
    {id:'evidence',label:'提交依赖与打断记录，申请复核',disabled:!(r.evidence>=40&&r.communication>=40),
      outcome:'需要证据、同步均达到 40；复核撤回本次辞退建议，但保留两次警告。'},
    {id:'plan',label:'接受一次限期改进计划',disabled:w.pipUsed,
      outcome:'整个职业记录限一次；暂缓辞退，下次低绩效仍可能解除任职。'},
    {id:'accept',label:'接受解除任职，重新求职',disabled:false,
      outcome:'保留已挣工资、资历和存款；失落持续三个游戏日。'},
  ];
}
function resolveAppraisal(game,id){
  const c=game.career,w=clone(c.workplace);
  if(c.location!=='home'||!appraisalChoices(game).some(v=>v.id===id&&!v.disabled))return game;
  const review={...w.reviews.at(-1),appealed:true};
  let jobId=c.jobId,stress=c.stress,fun=game.sim.needs.fun;
  if(id==='evidence'){w.warnings=2;w.performance=Math.max(55,w.performance);review.outcome='复核保留任职';}
  else if(id==='plan'){w.warnings=2;w.pipUsed=true;review.outcome='限期改进';}
  else {
    review.outcome='解除任职';w.dismissed={day:game.sim.day,jobId:c.jobId,reason:'连续低绩效且未通过复核'};
    jobId=null;stress=clamp(stress+20);fun=clamp(fun-25);w.emotion={kind:'dismissal',remaining:4320};
  }
  w.reviews=[...w.reviews.slice(0,-1),review];w.event=null;
  log(w,game.sim,w.supervisor,review.outcome);
  return {...game,career:{...c,jobId,stress,workplace:w},sim:{...game.sim,needs:{...game.sim.needs,fun}}};
}
const number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v,min,max)=>Number.isInteger(v)&&number(v,min,max);
const string=(v,max)=>typeof v==='string'&&v.length<=max;
export function validateWorkplace(w,sim){
  if(w===undefined)return true;
  if(!w||!['danbao','shuijie'].includes(w.supervisor)||!number(w.performance,0,100)||!integer(w.warnings,0,3)||
    typeof w.pipUsed!=='boolean'||!integer(w.projects,0,1e7)||!integer(w.bossStage,0,5)||!integer(w.lastBossProject,0,w.projects)||
    typeof w.smallStory!=='boolean'||typeof w.midStory!=='boolean'||!integer(w.serial,0,1e9)||!w.npcs||
    Object.keys(w.npcs).length!==4||!Array.isArray(w.reviews)||w.reviews.length>20||!Array.isArray(w.journal)||w.journal.length>60)return false;
  if(!Object.entries(newNpcState()).every(([id])=>{
    const n=w.npcs[id],a=n?.assignment;
    return n&&['trust','closeness','interest','energy','hunger','mood','stress'].every(k=>number(n[k],0,100))&&
      number(n.known,0,1)&&typeof n.informed==='boolean'&&integer(n.lastContactDay,0,sim.day)&&
      (a===null||a&&['small','complex'].includes(a.task)&&['promised','done','collected'].includes(a.status)&&
      ['elapsed','delay','duration','benefit'].every(k=>number(a[k],0,1000)));
  }))return false;
  if(w.project!==null){
    const p=w.project;
    if(!p||!integer(p.id,1,w.projects)||!integer(p.day,1,sim.day)||!integer(p.rank,1,3)||!PROJECT_TITLES.includes(p.title)||
      !number(p.required,240,900)||!number(p.done,0,p.required)||!['quality','credit','evidence','communication'].every(k=>number(p[k],0,100))||
      !['spent','focused','interrupted','overhead'].every(k=>number(p[k],0,1440))||!string(p.overheadLabel,80)||
      !integer(p.events,0,3)||!integer(p.missed,0,3)||!number(p.lastReport,-60,1440)||
      !Array.isArray(p.requests)||p.requests.length>8||new Set(p.requests).size!==p.requests.length||
      !p.requests.every(id=>typeof id==='string'&&(castById(id)||id.startsWith('follow-')&&castById(id.slice(7))))||
      typeof p.submitted!=='boolean'||typeof p.reviewed!=='boolean')return false;
  }
  if(w.event!==null){
    const e=w.event;
    if(!e||!w.project||!integer(e.id,1,w.serial)||!Object.hasOwn({...WORK_EVENTS,appraisal:true},e.type)||!castById(e.npcId)||
      !number(e.at,0,now(sim))||!number(e.waited,0,31)||e.projectId!==w.project?.id||
      !castForRank(w.project.rank).some(n=>n.id===e.npcId)||
      (e.type==='appraisal'?(!w.project.reviewed||!w.reviews.at(-1)?.risk||w.reviews.at(-1)?.appealed):
        w.project.reviewed||(WORK_EVENTS[e.type].npc==='leader'?w.supervisor:WORK_EVENTS[e.type].npc)!==e.npcId))return false;
  }
  if(!w.reviews.every(r=>r&&integer(r.projectId,1,w.projects)&&integer(r.day,1,sim.day)&&
    ['score','completion','evidence','communication','credit'].every(k=>number(r[k],0,100))&&number(r.interrupted,0,1440)&&
    ['risk','healthExit','appealed'].every(k=>typeof r[k]==='boolean')&&string(r.outcome,40)&&string(r.feedback,300))||
    !w.journal.every(r=>r&&integer(r.day,1,sim.day)&&number(r.time,0,1440)&&castById(r.npcId)&&string(r.text,400)))return false;
  if(w.dismissed!==null&&(!w.dismissed||!integer(w.dismissed.day,1,sim.day)||!string(w.dismissed.jobId,60)||!string(w.dismissed.reason,120)))return false;
  return w.emotion===null||w.emotion&&['reprimand','recognition','dismissal'].includes(w.emotion.kind)&&number(w.emotion.remaining,0,4320);
}
