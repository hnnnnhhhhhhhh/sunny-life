import {emotionProfile,EMOTIONS} from './emotions.js';
export const NEED_LEVELS=Object.freeze({
  good:{color:'#57966a',label:'良好'},warning:{color:'#c78c35',label:'偏低'},critical:{color:'#cb5c52',label:'紧急'},
});
export const needLevel=value=>value<=20?'critical':value<=50?'warning':'good';
export const newWellbeing=()=>({accidents:0,embarrassed:0,lastAccident:null});
const clock=sim=>(sim.day-1)*1440+sim.time;
export function advanceNeeds(sim,minutes,traits,tick,context={}){
  let next=sim,remaining=minutes;
  while(remaining>1e-8){
    const step=Math.min(1,remaining),before=next.needs;
    next=tick(next,step);
    const n={...next.needs},w={...(next.wellbeing||newWellbeing())};
    w.embarrassed=Math.max(0,w.embarrassed-step);
    if(traits.includes('社交达人'))n.social=Math.max(0,n.social-step*.018);
    const loneliness=Math.max(0,1-before.social/35);
    const discomfort=Math.max(0,1-before.hygiene/25)+Math.max(0,1-before.hunger/20);
    n.fun=Math.max(0,n.fun-step*(loneliness*(traits.includes('社交达人')?.65:.14)+discomfort*.09));
    if(before.hunger<15)n.energy=Math.max(0,n.energy-step*.035);
    if(n.bladder<=1e-8&&!context.usingToilet){
      n.bladder=65;n.hygiene=0;n.fun=Math.max(0,n.fun-18);
      w.accidents=Math.min(100000,w.accidents+1);w.embarrassed=90;
      w.lastAccident={at:clock(next),x:sim.x,z:sim.z};
    }
    next={...next,needs:n,wellbeing:w};remaining-=step;
  }
  return next;
}
export function moodState(game){
  const n=game.sim.needs,w=game.sim.wellbeing,stress=game.career?.stress||0;
  const emotion=game.career?.workplace?.emotion;
  let label='惬意',severity=needLevel(Math.min(...Object.values(n))),cause='';
  if(w?.embarrassed>0){label='窘迫';severity='critical';cause='刚刚失禁，需要清洁和休息';}
  else if(n.bladder<=20){label='急需如厕';cause='如厕需求紧急';}
  else if(n.energy<=20){label='精疲力竭';cause='需要睡眠';}
  else if(n.hunger<=20){label='饥饿';cause='需要进食';}
  else if(n.hygiene<=20){label='浑身不适';cause='需要洗澡';}
  else if(n.social<=20){label=game.avatar.traits.includes('社交达人')?'渴望陪伴':'孤独';cause='社交不足正在影响愉悦';}
  else if(emotion?.kind==='dismissal'){label='失业后的失落';severity=severity==='critical'||stress>=75?'critical':'warning';cause='刚刚失去工作，需要时间与支持';}
  else if(emotion?.kind==='reprimand'){label='被问责的委屈';severity=severity==='critical'||stress>=75?'critical':'warning';cause='项目评审的负面反馈仍在影响心情';}
  else if(stress>=75){label='倦怠';severity='critical';cause='工作压力过高';}
  else if(n.fun<=20){label='闷闷不乐';cause='需要娱乐和放松';}
  else if(stress>=45){label='压力较大';if(severity==='good')severity='warning';cause='需要休息';}
  else if(severity!=='good'){label='有些不适';cause='部分需求偏低';}
  else if(emotion?.kind==='recognition'){label='工作被认可';cause='这次交付获得肯定';}
  const profile=game.emotions?emotionProfile(game):null;
  if(profile?.dominant&&severity!=='critical'){
    const info=EMOTIONS[profile.dominant];
    label=emotion?.kind==='dismissal'&&profile.dominant==='sad'?'失业后的失落':
      emotion?.kind==='reprimand'&&profile.dominant==='hurt'?'被问责的委屈':info.label;
    cause=profile.sources.slice(0,3).map(s=>s.source).join('；');
    severity=['tense','sad','hurt'].includes(profile.dominant)?'warning':'good';
    return {label,severity,color:info.color,cause,emotion:profile.dominant};
  }
  return {label,severity,color:NEED_LEVELS[severity].color,cause};
}
export function validateWellbeing(w,sim){
  if(w===undefined)return true;
  if(!w||!Number.isInteger(w.accidents)||w.accidents<0||w.accidents>100000||
    !Number.isFinite(w.embarrassed)||w.embarrassed<0||w.embarrassed>90)return false;
  const a=w.lastAccident;
  return a===null||!!a&&Number.isFinite(a.at)&&a.at>=0&&a.at<=clock(sim)&&
    Number.isFinite(a.x)&&Math.abs(a.x)<=38&&Number.isFinite(a.z)&&Math.abs(a.z)<=38;
}
