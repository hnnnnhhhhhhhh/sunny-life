import {utilities} from './finance.js';
import {addEmotion,emotionProfile} from './emotions.js';
export const FRIENDS=Object.freeze([
  {id:'neighbor-1',name:'江宁',age:28,preferred:'listen',trait:'慢热、重视倾听',avatar:{base:'male',hair:'short',top:'#819b9d',outfit:'shirt',height:1.03,build:.95}},
  {id:'neighbor-2',name:'阿遥',age:26,preferred:'joke',trait:'开朗、喜欢有趣的聊天',avatar:{base:'female',hair:'curly',top:'#be929d',outfit:'cardigan',height:.96,build:.95}},
  {id:'neighbor-3',name:'陈雨',age:30,preferred:'talk',trait:'细心、需要独处空间',avatar:{base:'male',hair:'short',top:'#b1a376',outfit:'cardigan',height:.98,build:1.05}},
]);
export const SOCIAL_ACTIONS=Object.freeze({
  talk:{label:'聊聊近况',duration:12,friendship:6,trust:2,social:12},
  joke:{label:'分享趣事',duration:10,friendship:5,fun:8,social:8},
  listen:{label:'倾听与安慰',duration:15,friendship:4,trust:6,resentment:-6,social:10,stress:-8},
  flirt:{label:'表达好感',duration:12,romance:10,social:8},
  confess:{label:'确认恋爱关系',duration:12},
  apologize:{label:'认真道歉',duration:15,trust:5,resentment:-15,social:6},
  affection:{label:'说一句情话',duration:10,romance:7,trust:2,social:8},
  breakup:{label:'提出分手',duration:12},
});
const time=sim=>(sim.day-1)*1440+sim.time;
const clamp=n=>Math.max(0,Math.min(100,n));
export function newSocial(day=1){return {contacts:FRIENDS.map((f,i)=>({id:f.id,friendship:35-i*5,romance:0,trust:40,
  resentment:0,satisfaction:50,relationship:'friend',mood:65,lastInteraction:0,cooldown:0})),
  visit:null,interaction:null,serial:0,conflict:null,history:[],lastDecayDay:day};}
export const friendById=id=>FRIENDS.find(f=>f.id===id);
export const contactFor=(game,id)=>game.social?.contacts.find(f=>f.id===id);
export function visitError(game,ids,kind='chat'){
  if(game.career.location==='office'||game.life.shopping)return '回家后再邀请朋友';
  if(game.social.visit)return '已有来访安排';
  if(!utilities(game).phone)return '电话已停机，缴清电话费后再邀请';
  if(!Array.isArray(ids)||ids.length<1||ids.length>3||new Set(ids).size!==ids.length||!ids.every(friendById))return '请选择认识的朋友';
  if(game.sim.time<480||game.sim.time>1260)return '朋友在 08:00—21:00 接受邀请';
  if(kind==='party'&&game.budget<60)return '准备聚会需要 60 生活币';
  return null;
}
export function socialActionError(game,id,verb){
  const c=contactFor(game,id),a=SOCIAL_ACTIONS[verb];
  if(!c||!a)return '无法进行这项交流';
  if(game.social.visit?.stage!=='active'||!game.social.visit.ids.includes(id))return '等朋友到家后再交流';
  if(game.social.conflict)return '先处理当前的关系摩擦';
  if(game.career.location==='office'||game.life.shopping)return '先回家';
  if(time(game.sim)<c.cooldown)return '给对方一点回应时间';
  if(verb==='flirt'&&c.friendship<35)return '先熟悉彼此';
  if(verb==='confess'&&(c.friendship<55||c.romance<40||c.trust<50||c.resentment>=30))return '需要更多友谊、好感与信任';
  if(verb==='confess'&&game.social.contacts.some(v=>v.relationship==='partner'))return '先处理已有的恋爱关系';
  if(['affection','breakup'].includes(verb)&&c.relationship!=='partner')return '你们还不是恋人';
  return null;
}
function record(game,id,text){
  return {...game,social:{...game.social,history:[...game.social.history.slice(-39),{day:game.sim.day,id,text}]}};
}
export function socialAction(game,action){
  const s=game.social;
  if(action.kind==='invite'){
    if(!['chat','party','date'].includes(action.visitKind)||visitError(game,action.ids,action.visitKind))return game;
    return {...game,budget:game.budget-(action.visitKind==='party'?60:0),social:{...s,serial:s.serial+1,
      visit:{id:s.serial+1,ids:action.ids,kind:action.visitKind,stage:'arriving',elapsed:0,duration:action.visitKind==='party'?180:120,conflictChecked:false},conflict:null}};
  }
  if(action.kind==='arrived'&&s.visit?.id===action.id&&s.visit.stage==='arriving')
    return {...game,social:{...s,visit:{...s.visit,stage:'active'}}};
  if(action.kind==='dismiss'&&s.visit)return {...game,social:{...s,visit:{...s.visit,stage:'leaving'},conflict:null,interaction:null}};
  if(action.kind==='departed'&&s.visit?.id===action.id&&s.visit.stage==='leaving')return {...game,social:{...s,visit:null,conflict:null,interaction:null}};
  if(action.kind==='begin'){
    if(s.interaction||socialActionError(game,action.id,action.verb))return game;
    return {...game,social:{...s,interaction:{id:action.id,verb:action.verb,visitId:s.visit.id,elapsed:0}}};
  }
  if(action.kind==='cancel')return {...game,social:{...s,interaction:null}};
  if(action.kind==='resolveConflict'){
    const conflict=s.conflict;
    if(!conflict||conflict.id!==action.id||!['explain','space','lash'].includes(action.choice))return game;
    const c=contactFor(game,conflict.friendId),updated={...c};
    let next={...game,social:{...s,conflict:null}};
    if(action.choice==='explain'){
      updated.trust=clamp(c.trust+5);updated.resentment=clamp(c.resentment-5);
      next={...next,career:{...next.career,stress:clamp(next.career.stress-10)}};
      next=addEmotion(next,'understood','calm','向对方说明压力，得到了理解',30,120);
    }else if(action.choice==='space'){
      next={...next,career:{...next.career,stress:clamp(next.career.stress-8)}};
      updated.cooldown=time(game.sim)+10;
      if(c.id==='neighbor-3')updated.trust=clamp(c.trust+3);
      next=addEmotion(next,'space','calm','暂时独处，给彼此空间',24,90);
    }else{
      updated.friendship=clamp(c.friendship-12);updated.trust=clamp(c.trust-12);
      updated.resentment=clamp(c.resentment+25);updated.satisfaction=clamp(c.satisfaction-20);
      next=addEmotion(next,'argument','hurt',`与${friendById(c.id).name}因压力争吵`,42,360);
    }
    next={...next,social:{...next.social,contacts:s.contacts.map(v=>v.id===c.id?updated:v)}};
    return record(next,c.id,{explain:'说明压力并沟通',space:'约定暂时冷静',lash:'把压力发泄到对方身上'}[action.choice]);
  }
  if(action.kind!=='complete'||action.visitId!==s.visit?.id||socialActionError(game,action.id,action.verb)||
    s.interaction?.id!==action.id||s.interaction.verb!==action.verb||s.interaction.elapsed<SOCIAL_ACTIONS[action.verb].duration)return game;
  const c=contactFor(game,action.id),a=SOCIAL_ACTIONS[action.verb],profile=emotionProfile(game);
  const tense=profile.irritability+c.resentment*.45>60;
  const romantic=['flirt','confess','affection'].includes(action.verb);
  const reject=romantic&&(tense||c.trust<30||c.mood<30);
  const nextContact={...c,cooldown:time(game.sim)+8,lastInteraction:time(game.sim)};
  let next=game;
  if(reject){
    nextContact.satisfaction=clamp(c.satisfaction-5);
    next=addEmotion(next,'rejected','hurt','今天的压力让亲密表达没有得到回应',25,120);
  }else if(action.verb==='breakup'){
    nextContact.relationship='ex';nextContact.romance=Math.min(10,c.romance);nextContact.resentment=clamp(c.resentment+15);
    next=addEmotion(next,'breakup','sad','一段恋爱关系结束了',45,720);
  }else{
    for(const key of ['friendship','romance','trust','resentment'])nextContact[key]=clamp(c[key]+(a[key]||0)*(tense&&key==='friendship'?.5:1));
    if(friendById(c.id).preferred===action.verb){
      nextContact.friendship=clamp(nextContact.friendship+2);nextContact.trust=clamp(nextContact.trust+2);
    }
    nextContact.satisfaction=clamp(c.satisfaction+(romantic?6:3));
    if(action.verb==='confess')nextContact.relationship='partner';
    else if(action.verb==='flirt'&&nextContact.romance>=20&&c.relationship!=='partner')nextContact.relationship='dating';
    if(romantic)next=addEmotion(next,'sweet','sweet',`与${friendById(c.id).name}的亲密时刻`,40,180);
    else if(action.verb==='apologize')next=addEmotion(next,'repair','calm','争吵后认真道歉，关系开始修复',26,120);
    else next=addEmotion(next,'company','happy',`与${friendById(c.id).name}相处`,22,90);
  }
  const needs={...next.sim.needs,social:clamp(next.sim.needs.social+(a.social||4)),fun:clamp(next.sim.needs.fun+(reject?0:a.fun||2))};
  next={...next,sim:{...next.sim,needs},career:{...next.career,stress:clamp(next.career.stress+(a.stress||0))},
    social:{...next.social,interaction:null,contacts:s.contacts.map(v=>v.id===c.id?nextContact:v)}};
  return record(next,c.id,`${a.label}：${reject?'对方暂时没有回应':'交流已发生'}`);
}
export function advanceSocial(game,minutes,context={}){
  if(!game.social)return game;
  let s=game.social,visit=s.visit,conflict=s.conflict,contacts=s.contacts,interaction=s.interaction;
  if(game.sim.day>s.lastDecayDay){
    const days=game.sim.day-s.lastDecayDay;
    contacts=contacts.map(c=>({...c,friendship:clamp(c.friendship-days*.4),romance:clamp(c.romance-days*.3),
      resentment:clamp(c.resentment-days*2),mood:clamp(c.mood+days*3)}));
    s={...s,lastDecayDay:game.sim.day};
  }
  if(visit?.stage==='active'){
    if(interaction&&context.guestActive)interaction={...interaction,elapsed:Math.min(SOCIAL_ACTIONS[interaction.verb].duration,interaction.elapsed+minutes)};
    visit={...visit,elapsed:Math.min(visit.duration,visit.elapsed+minutes)};
    if(!visit.conflictChecked&&visit.elapsed>=30&&!interaction){
      visit.conflictChecked=true;
      const close=contacts.find(c=>visit.ids.includes(c.id)&&(c.relationship==='partner'||c.friendship>=35));
      const profile=emotionProfile(game);
      if(close&&profile.irritability+close.resentment*.45>=60){
        conflict={id:visit.id,friendId:close.id,source:profile.sources[0]?.source||'累积的压力'};
      }
    }
    if(visit.elapsed>=visit.duration&&!interaction){visit.stage='leaving';conflict=null;}
  }
  return {...game,social:{...s,contacts,visit,conflict,interaction}};
}
export function validateSocial(s,sim){
  if(s===undefined)return true;
  const numeric=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  if(!s||!Number.isInteger(s.serial)||s.serial<0||s.serial>1e9||!Array.isArray(s.contacts)||s.contacts.length!==3||
    !s.contacts.every((c,i)=>c?.id===FRIENDS[i].id&&['friendship','romance','trust','resentment','satisfaction','mood'].every(k=>numeric(c[k],0,100))&&
      ['friend','dating','partner','ex'].includes(c.relationship)&&numeric(c.cooldown,0,time(sim)+1440)&&numeric(c.lastInteraction,0,time(sim)))||
    s.contacts.filter(c=>c.relationship==='partner').length>1||!Number.isInteger(s.lastDecayDay)||s.lastDecayDay<1||s.lastDecayDay>sim.day||
    !Array.isArray(s.history)||s.history.length>40||!s.history.every(h=>h&&Number.isInteger(h.day)&&h.day>=1&&h.day<=sim.day&&friendById(h.id)&&typeof h.text==='string'&&h.text.length<=200))return false;
  const v=s.visit;
  const a=s.interaction;
  if(a!==null&&(!a||!v||v.stage!=='active'||!v.ids?.includes(a.id)||!Object.hasOwn(SOCIAL_ACTIONS,a.verb)||
    a.visitId!==v.id||!numeric(a.elapsed,0,SOCIAL_ACTIONS[a.verb].duration)))return false;
  if(v!==null&&(!v||!Number.isInteger(v.id)||v.id<1||v.id>s.serial||!Array.isArray(v.ids)||v.ids.length<1||v.ids.length>3||
    new Set(v.ids).size!==v.ids.length||!v.ids.every(friendById)||!['chat','party','date'].includes(v.kind)||
    !['arriving','active','leaving'].includes(v.stage)||![120,180].includes(v.duration)||!numeric(v.elapsed,0,v.duration)||typeof v.conflictChecked!=='boolean'))return false;
  return s.conflict===null||s.conflict&&v?.stage==='active'&&s.conflict.id===v.id&&v.ids.includes(s.conflict.friendId)&&
    typeof s.conflict.source==='string'&&s.conflict.source.length<=120;
}
