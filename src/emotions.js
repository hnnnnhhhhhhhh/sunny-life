import {utilities} from './finance.js';
export const EMOTIONS=Object.freeze({
  calm:{label:'宁静',color:'#638d87'},sweet:{label:'甜蜜',color:'#b27591'},
  happy:{label:'愉快',color:'#57966a'},tense:{label:'烦躁',color:'#bb8246'},
  sad:{label:'低落',color:'#74869a'},hurt:{label:'委屈',color:'#aa7880'},
});
export const newEmotions=()=>({effects:[],reflectionDay:0,quietMinutes:0});
export function addEmotion(game,id,emotion,source,strength,minutes){
  if(!game.emotions||!EMOTIONS[emotion])return game;
  return {...game,emotions:{...game.emotions,effects:[...game.emotions.effects.filter(e=>e.id!==id).slice(-15),
    {id,emotion,source,strength,remaining:minutes,duration:minutes}]}};
}
export function emotionProfile(game){
  const n=game.sim.needs,u=utilities(game),work=game.career.workplace?.emotion;
  const effects=(game.emotions?.effects||[]).map(e=>({...e,weight:e.strength*(.35+.65*e.remaining/e.duration)}));
  const sources=[];
  const add=(emotion,weight,source)=>{if(weight>2)sources.push({emotion,weight,source});};
  for(const e of effects)add(e.emotion,e.weight,e.source);
  add('tense',game.career.stress*.55,'工作压力尚未消退');
  if(work?.kind==='reprimand')add('hurt',25,'被工作问责');
  if(work?.kind==='dismissal')add('sad',40,'失去工作');
  if(work?.kind==='recognition')add('happy',18,'交付受到认可');
  if(!u.power)add('tense',28,'电费逾期，家中停电');
  if(!u.water)add('tense',20,'水费逾期，家中停水');
  if(u.rentOverdue)add('tense',18,'房租逾期带来居住压力');
  if(!u.internet)add('tense',8,'网络服务暂停');
  if(n.energy<35)add('tense',(35-n.energy)*.65,'疲惫让耐心下降');
  if(n.hunger<30)add('tense',(30-n.hunger)*.5,'饥饿带来的不适');
  if(game.emotions?.quietMinutes>=2)add('calm',Math.min(36,18+game.emotions.quietMinutes*.2),'独处休息');
  const scores=Object.fromEntries(Object.keys(EMOTIONS).map(k=>[k,0]));
  for(const s of sources)scores[s.emotion]+=s.weight;
  const irritability=Math.min(100,scores.tense+scores.hurt*.65+scores.sad*.25);
  scores.sweet*=Math.max(.2,1-irritability/120);
  scores.calm*=Math.max(.15,1-irritability/100);
  const dominant=Object.keys(scores).sort((a,b)=>scores[b]-scores[a])[0];
  return {irritability,scores,dominant:scores[dominant]>=15?dominant:null,
    sources:sources.sort((a,b)=>b.weight-a.weight),safety:Math.max(0,100-u.overdue*15-(u.power?0:20))};
}
export function advanceEmotions(game,minutes,context={}){
  if(!game.emotions)return game;
  const quiet=context.activity==='rest'&&!game.social?.visit;
  return {...game,emotions:{...game.emotions,
    quietMinutes:quiet?Math.min(60,game.emotions.quietMinutes+minutes):0,
    effects:game.emotions.effects.map(e=>({...e,remaining:e.remaining-minutes})).filter(e=>e.remaining>0)}};
}
export function reflectionAction(game,kind){
  const choices={stress:['tense','现实记录：今天工作不顺',35],tired:['sad','现实记录：今天感到疲惫',28],joy:['happy','现实记录：今天有件开心事',32]};
  if(!choices[kind]||game.emotions.reflectionDay===game.sim.day)return game;
  const [emotion,source,strength]=choices[kind];
  const next=addEmotion(game,'reflection',emotion,source,strength,240);
  return {...next,emotions:{...next.emotions,reflectionDay:game.sim.day}};
}
export function validateEmotions(e,sim){
  if(e===undefined)return true;
  return !!e&&Number.isInteger(e.reflectionDay)&&e.reflectionDay>=0&&e.reflectionDay<=sim.day&&
    Number.isFinite(e.quietMinutes)&&e.quietMinutes>=0&&e.quietMinutes<=60&&Array.isArray(e.effects)&&e.effects.length<=16&&
    new Set(e.effects.map(v=>v?.id)).size===e.effects.length&&e.effects.every(v=>v&&typeof v.id==='string'&&v.id.length<=80&&
      Object.hasOwn(EMOTIONS,v.emotion)&&typeof v.source==='string'&&v.source.length<=120&&
      Number.isFinite(v.strength)&&v.strength>0&&v.strength<=100&&Number.isFinite(v.duration)&&v.duration>0&&v.duration<=4320&&
      Number.isFinite(v.remaining)&&v.remaining>0&&v.remaining<=v.duration);
}
