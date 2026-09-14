import {moodState} from './needs.js';
import {ageEffects} from './life.js';
import {newWorkplace,beginProject,advanceWorkplace,assessProject,prepareAppraisal,workplaceAction,validateWorkplace} from './workplace.js';
import {workday} from './calendar.js';
import {newAttendance,attendanceAction,markArrival,validateAttendance} from './attendance.js';
export const JOBS=Object.freeze([
  {id:'assistant',track:'business',rank:1,size:'小型公司',required:0,title:'文档助理',company:'青禾商务中心',salary:320,start:540,end:1020,pressure:.75,task:'整理文档',color:'#809b9d'},
  {id:'designer',track:'design',rank:1,size:'小型公司',required:0,title:'视觉设计师',company:'青禾设计事务所',salary:480,start:600,end:1080,pressure:1,task:'修改设计稿',color:'#929aad'},
  {id:'tester',track:'tech',rank:1,size:'小型公司',required:0,title:'软件测试员',company:'青禾数码',salary:600,start:540,end:1080,pressure:1.15,task:'核对测试用例',color:'#88a28c'},
  {id:'specialist',track:'business',rank:2,size:'中型公司',required:40,title:'运营骨干',company:'知行商务',salary:720,start:540,end:1080,pressure:1.3,task:'协调项目',color:'#809b9d'},
  {id:'senior-designer',track:'design',rank:2,size:'中型公司',required:50,title:'资深设计师',company:'知行创意',salary:900,start:540,end:1080,pressure:1.45,task:'审核设计方案',color:'#929aad'},
  {id:'engineer',track:'tech',rank:2,size:'中型公司',required:60,title:'质量工程师',company:'知行科技',salary:1050,start:540,end:1110,pressure:1.6,task:'保障项目质量',color:'#88a28c'},
  {id:'manager',track:'business',rank:3,size:'大型公司',required:140,title:'运营经理',company:'远景集团',salary:1450,start:540,end:1140,pressure:1.9,task:'管理业务团队',color:'#809b9d'},
  {id:'design-director',track:'design',rank:3,size:'大型公司',required:160,title:'设计总监',company:'远景创意集团',salary:1800,start:540,end:1140,pressure:2.1,task:'制定产品方向',color:'#929aad'},
  {id:'tech-lead',track:'tech',rank:3,size:'大型公司',required:180,title:'技术主管',company:'远景科技集团',salary:2200,start:540,end:1170,pressure:2.3,task:'带领研发团队',color:'#88a28c'},
]);
export const newColleagues=()=>[{id:'lin',name:'林知夏',trust:45},{id:'zhou',name:'周予安',trust:40}];
export function hiringError(game,id){
  const job=jobFor(id),c=game.career;
  if(!job)return '职位不存在';
  if(game.life?.retired)return '已退休';
  if(c.workplace?.event?.type==='appraisal')return '先处理绩效复核，再办理入职';
  if(c.attendance?.review)return '先处理缺勤复核';
  if(atWork(game)||game.life?.shopping)return '回家后再办理入职';
  if((c.qualification||0)<job.required)return `还需 ${Math.ceil(job.required-(c.qualification||0))} 点资历`;
  if(job.rank>1&&(c.highestRank||1)<job.rank-1)return '先完成上一职级的历练';
  return null;
}
export const REFRESHMENTS=Object.freeze({
  coffee:{label:'咖啡',price:18,duration:10,energy:12,fun:4,hunger:0,stress:5},
  lunch:{label:'三明治',price:28,duration:25,energy:3,fun:7,hunger:45,stress:8},
});
export const jobFor=id=>JOBS.find(job=>job.id===id);
export const absoluteTime=sim=>(sim.day-1)*1440+sim.time;
export const atWork=game=>game.career?.location==='office';
export const phaseDuration=career=>({arriving:3,toCafe:5,toDesk:5,toToilet:5,toilet:6,fromToilet:5,rest:15,leaving:5,
  break:REFRESHMENTS[career.breakKind]?.duration||10}[career.phase]||Infinity);
export const jobHours=job=>`${clockText(job.start)} - ${clockText(job.end)}`;
export function clockText(time){return `${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;}
export function newCareer(){
  return {jobId:null,location:'home',phase:'idle',phaseMinutes:0,breakKind:null,shift:null,
    workplace:newWorkplace(),
    attendance:newAttendance(1),
    qualification:0,highestRank:1,colleagues:newColleagues(),jobHistory:[],
    stress:0,totalEarned:0,lastPaidDay:0,lastPay:null,coffeeDay:0,coffeesToday:0,lastCoffeeAt:0,lunchDay:0,exitOrigin:null};
}
export function residentMood(game){
  return moodState(game).label;
}
export function workStatus(game){
  const c=game.career||newCareer(),job=jobFor(c.jobId);
  const p=c.workplace?.project;
  const workingLabel=c.workplace?.event?'等待处理工作来讯':p?.overhead>0?p.overheadLabel:p?.submitted?'版本已提交，等待评审':job?.task||'工作中';
  return {job,away:atWork(game),label:{
    idle:job?'尚未出勤':'未就业',arriving:'前往工位',waiting:'等待开工',working:workingLabel,
    toCafe:'前往咖啡吧',break:c.breakKind==='lunch'?'午餐时间':'喝杯咖啡',toDesk:'返回工位',rest:'休息片刻',leaving:'下班回家',
    toToilet:'前往洗手间',toilet:'正在如厕',fromToilet:'返回工位',
  }[c.phase],earned:job&&c.shift?Math.round(job.salary*c.shift.worked/(job.end-job.start)):0};
}
export function departureError(game){
  const c=game.career||newCareer(),job=jobFor(c.jobId);
  if(game.life?.retired)return '已退休，可以自由安排生活';
  if(game.life?.shopping)return '购物结束后再去上班';
  if(game.social?.visit)return '先送朋友离开，再出门上班';
  if(!workday(game.sim.day))return '今天是休息日';
  if(c.attendance?.leaveDay===game.sim.day)return '今天已请假';
  if(c.attendance?.review)return '先处理缺勤复核';
  if(c.workplace?.event?.type==='appraisal')return '先完成绩效复核，才能开始下一班';
  if(!job)return '先在电脑上找一份工作';
  if(atWork(game))return '已经在公司了';
  if(c.lastPaidDay>=game.sim.day)return '今天的工资已结算，明天再来';
  if(game.sim.time<job.start-30)return `${clockText(job.start-30)} 起可以出门上班`;
  if(game.sim.time>=job.end-15)return '今天的工作时间已结束';
  if(game.sim.needs.energy<12||game.sim.needs.hunger<8)return '先休息或吃点东西，再去上班';
  return null;
}
export function refreshmentError(game,kind){
  const c=game.career,drink=REFRESHMENTS[kind];
  if(!drink||!atWork(game)||c.phase!=='working')return '回到工位后再安排休息';
  if(game.budget<drink.price)return '余额不足';
  if(kind==='coffee'&&c.coffeeDay===game.sim.day&&c.coffeesToday>=2)return '今天已经喝了两杯咖啡';
  if(kind==='coffee'&&c.coffeeDay===game.sim.day&&absoluteTime(game.sim)-c.lastCoffeeAt<90)return '距离上一杯咖啡还不足 90 分钟';
  if(kind==='lunch'&&c.lunchDay===game.sim.day)return '今天已经买过午餐';
  return null;
}
function origin(c){return {phase:c.phase,phaseMinutes:c.phaseMinutes,breakKind:c.breakKind};}
function settle(game,reason='下班'){
  let c=game.career;
  const job=jobFor(c.jobId);
  if(!c.shift||c.phase==='leaving')return game;
  game=assessProject(game,job,reason);c=game.career;
  const amount=c.lastPaidDay>=c.shift.day?0:Math.min(1000000-game.budget,Math.round(job.salary*c.shift.worked/(job.end-job.start)));
  return {...game,budget:game.budget+amount,career:{...c,phase:'leaving',phaseMinutes:0,exitOrigin:origin(c),
    lastPaidDay:Math.max(c.lastPaidDay,c.shift.day),totalEarned:Math.min(1e9,c.totalEarned+amount),
    lastPay:{day:c.shift.day,jobId:c.jobId,amount,minutes:c.shift.worked,reason}}};
}
export function careerAction(game,action){
  const c=game.career||newCareer();
  if(action.kind==='attendance')return attendanceAction(game,action.value,jobFor(c.jobId));
  if(action.kind==='workplace')return workplaceAction(game,action.value,jobFor(c.jobId));
  if(action.kind==='hire'){
    if(hiringError(game,action.jobId)||c.jobId===action.jobId)return game;
    const job=jobFor(action.jobId),previous=jobFor(c.jobId);
    return {...game,finance:game.finance&&!game.finance.leaseLocked?{...game.finance,rent:job.salary*4,leaseLocked:true}:game.finance,
      career:{...c,jobId:action.jobId,highestRank:Math.max(c.highestRank||1,job.rank),
      attendance:{...newAttendance(game.sim.day),lastChecked:game.sim.time>=job.end?game.sim.day:game.sim.day-1},
      workplace:{...(c.workplace||newWorkplace()),warnings:0,performance:70,event:null,project:null,
        supervisor:job.rank===1?'danbao':c.workplace?.supervisor||'danbao'},
      colleagues:previous&&previous.company!==job.company?c.colleagues.map(person=>({...person,trust:Math.round(30+person.trust*.35)})):c.colleagues,
      jobHistory:[...(c.jobHistory||[]).slice(-19),{day:game.sim.day,jobId:job.id}]}};
  }
  if(action.kind==='depart'){
    if(departureError(game))return game;
    return {...game,career:{...markArrival(beginProject(c,jobFor(c.jobId),game.sim),game.sim,jobFor(c.jobId)),location:'office',phase:'arriving',phaseMinutes:0,breakKind:null,exitOrigin:null,
      shift:{day:game.sim.day,jobId:c.jobId,worked:0,continuous:0,returnPoint:{x:game.sim.x,z:game.sim.z}}}};
  }
  if(action.kind==='refreshment'){
    if(refreshmentError(game,action.refreshment))return game;
    const kind=action.refreshment;
    return {...game,budget:game.budget-REFRESHMENTS[kind].price,career:{...c,phase:'toCafe',phaseMinutes:0,breakKind:kind,
      ...(kind==='coffee'?{coffeeDay:game.sim.day,coffeesToday:c.coffeeDay===game.sim.day?c.coffeesToday+1:1,lastCoffeeAt:absoluteTime(game.sim)}:{lunchDay:game.sim.day})}};
  }
  if(action.kind==='rest'&&atWork(game)&&c.phase==='working')
    return {...game,career:{...c,phase:'rest',phaseMinutes:0,breakKind:null}};
  if(action.kind==='toilet'&&atWork(game)&&['working','waiting','rest'].includes(c.phase))
    return {...game,career:{...c,phase:'toToilet',phaseMinutes:0,breakKind:null}};
  if(action.kind==='resume'&&atWork(game)&&['rest','break'].includes(c.phase))
    return {...game,career:{...c,phase:c.phase==='break'?'toDesk':'working',phaseMinutes:0,shift:{...c.shift,continuous:0}}};
  if(action.kind==='leave'&&atWork(game))return settle(game,'提前下班');
  return game;
}

function nextPhase(game){
  const c=game.career,job=jobFor(c.jobId);
  if(c.phase==='leaving'){
    return {...game,sim:{...game.sim,...c.shift.returnPoint},career:prepareAppraisal({...c,location:'home',phase:'idle',phaseMinutes:0,shift:null,breakKind:null,exitOrigin:null},game.sim)};
  }
  const phase={arriving:game.sim.time<job.start?'waiting':'working',waiting:'working',toCafe:'break',break:'toDesk',toDesk:'working',rest:'working',
    toToilet:'toilet',toilet:'fromToilet',fromToilet:'working'}[c.phase];
  return phase?{...game,career:{...c,phase,phaseMinutes:0,shift:{...c.shift,continuous:0}}}:game;
}

// The existing simulation clock remains the only source of elapsed work time.
export function advanceCareer(game,minutes,tickSim){
  if(!Number.isFinite(minutes)||minutes<=0)return game;
  let next=game,remaining=minutes;
  while(remaining>1e-8){
    let c=next.career||newCareer();
    if(!atWork(next)){
      const sim=tickSim(next.sim,remaining);
      const stress=Math.max(0,c.stress-remaining*(next.sim.needs.fun>55?.085:.045));
      return advanceWorkplace({...next,sim,career:stress===c.stress&&next.career?c:{...c,stress}},remaining,null);
    }
    const job=jobFor(c.jobId),now=absoluteTime(next.sim),end=(c.shift.day-1)*1440+job.end;
    if(next.sim.autonomy&&['working','waiting'].includes(c.phase)&&next.sim.needs.bladder<20){
      next=careerAction(next,{kind:'toilet'});continue;
    }
    if(c.phase!=='leaving'&&now>=end-1e-8){next=settle(next);continue;}
    if(c.phase==='waiting'&&next.sim.time>=job.start){next=nextPhase(next);continue;}
    const phaseLeft=phaseDuration(c)-c.phaseMinutes;
    if(phaseLeft<=1e-8){next=nextPhase(next);continue;}
    const step=Math.min(remaining,1,phaseLeft,c.phase==='leaving'?Infinity:end-now,
      c.phase==='waiting'?job.start-next.sim.time:Infinity);
    const sim=tickSim(next.sim,step,{usingToilet:c.phase==='toilet'}),needs={...sim.needs},shift={...c.shift};
    let stress=c.stress;
    if(c.phase==='working'){
      const prolonged=shift.continuous>=120;
      shift.worked+=step;shift.continuous+=step;
      needs.energy=Math.max(0,needs.energy-step*(.018+(prolonged?.023:0))*job.pressure);
      needs.fun=Math.max(0,needs.fun-step*(.04+(prolonged?.065:0))*job.pressure);
      stress=Math.min(100,stress+step*(prolonged?.15:.045)*job.pressure);
    }else if(c.phase==='toilet'){
      needs.bladder=Math.min(100,needs.bladder+step*17);
    }else if(c.phase==='rest'){
      needs.energy=Math.min(100,needs.energy+step*.3);
      needs.fun=Math.min(100,needs.fun+step*.22);
      stress=Math.max(0,stress-step*.45);
    }else if(c.phase==='break'){
      const meal=REFRESHMENTS[c.breakKind],fraction=step/meal.duration;
      for(const key of ['energy','fun','hunger'])needs[key]=Math.min(100,needs[key]+meal[key]*fraction);
      stress=Math.max(0,stress-meal.stress*fraction);
    }
    const qualification=Math.min(1000000,(c.qualification||0)+(c.phase==='working'?step*.025*ageEffects(next).qualification:0));
    const colleagues=c.phase==='working'?c.colleagues.map(person=>({...person,
      trust:Math.max(0,Math.min(100,person.trust+step*(stress>70?-.009*job.rank:.003/job.rank)))})):c.colleagues;
    c={...c,phaseMinutes:c.phaseMinutes+step,stress,shift,qualification,colleagues};
    next=advanceWorkplace({...next,sim:{...sim,needs},career:c},step,job);remaining-=step;
    c=next.career;
    if(c.phase==='working'&&(needs.energy<5||needs.hunger<3)){next=settle(next,'身体需要休息');}
    else if(c.phase!=='leaving'&&absoluteTime(next.sim)>=end-1e-8){next=settle(next);}
    else if(c.phaseMinutes>=phaseDuration(c)-1e-8)next=nextPhase(next);
  }
  return next;
}

const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v,min,max)=>number(v,min,max)&&Number.isInteger(v);
const phases=['idle','arriving','waiting','working','toCafe','break','toDesk','rest','leaving','toToilet','toilet','fromToilet'];
export function validateCareer(c,sim){
  if(c===undefined)return true;
  if(!c||Array.isArray(c)||!(c.jobId===null||jobFor(c.jobId))||!['home','office'].includes(c.location)||
    !phases.includes(c.phase)||!number(c.phaseMinutes,0,1440)||!number(c.stress,0,100)||
    !number(c.totalEarned,0,1e9)||!integer(c.lastPaidDay,0,sim.day)||
    !integer(c.coffeeDay,0,sim.day)||!integer(c.coffeesToday,0,2)||!number(c.lastCoffeeAt,0,absoluteTime(sim))||
    !integer(c.lunchDay,0,sim.day)||!(c.breakKind===null||REFRESHMENTS[c.breakKind])||!validateWorkplace(c.workplace,sim)||
    c.workplace?.dismissed&&!jobFor(c.workplace.dismissed.jobId)||!validateAttendance(c.attendance,sim))return false;
  if(c.qualification!==undefined&&!number(c.qualification,0,1000000)||
    c.highestRank!==undefined&&!integer(c.highestRank,1,3)||
    c.colleagues!==undefined&&(!Array.isArray(c.colleagues)||c.colleagues.length!==2||
      c.colleagues.some((p,i)=>p?.id!==newColleagues()[i].id||p.name!==newColleagues()[i].name||!number(p.trust,0,100)))||
    c.jobHistory!==undefined&&(!Array.isArray(c.jobHistory)||c.jobHistory.length>20||
      !c.jobHistory.every(h=>h&&integer(h.day,1,sim.day)&&jobFor(h.jobId))))return false;
  if(c.lastPay!==null&&(!c.lastPay||!integer(c.lastPay.day,1,sim.day)||!jobFor(c.lastPay.jobId)||
    !number(c.lastPay.amount,0,jobFor(c.lastPay.jobId).salary)||!number(c.lastPay.minutes,0,660)||
    !['下班','提前下班','身体需要休息'].includes(c.lastPay.reason)||c.lastPay.day!==c.lastPaidDay))return false;
  const event=c.workplace?.event,project=c.workplace?.project;
  if(c.attendance?.review&&(!c.jobId||c.location!=='home'||c.attendance.absences<3))return false;
  if(event&&(event.type==='appraisal'?c.location!=='home'||!c.jobId:c.location!=='office'||c.phase==='leaving'))return false;
  if(c.location==='office'&&project&&(project.rank!==jobFor(c.jobId)?.rank||project.day!==c.shift?.day))return false;
  if(c.location==='home')return c.phase==='idle'&&c.shift===null&&c.exitOrigin===null;
  const s=c.shift,job=jobFor(c.jobId);
  if(!job||c.phase==='idle'||!s||!integer(s.day,1,sim.day)||!number(s.worked,0,job.end-job.start+.0001)||
    !number(s.continuous,0,s.worked+.0001)||!s.returnPoint||!number(s.returnPoint.x,-38,38)||!number(s.returnPoint.z,-38,38)||
    c.phaseMinutes>phaseDuration(c)+.0001||(['toCafe','break','toDesk'].includes(c.phase)&&!REFRESHMENTS[c.breakKind]))return false;
  if(c.phase==='leaving'){
    const o=c.exitOrigin;
    return !!o&&phases.includes(o.phase)&&!['idle','leaving'].includes(o.phase)&&number(o.phaseMinutes,0,1440)&&
      (o.breakKind===null||!!REFRESHMENTS[o.breakKind])&&c.lastPaidDay>=s.day;
  }
  return c.exitOrigin===null&&c.lastPaidDay<s.day&&sim.day===s.day;
}
