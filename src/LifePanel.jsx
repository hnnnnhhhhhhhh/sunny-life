import React, {useRef,useState,useEffect} from 'react';
import {Coins,Heart,CalendarDays,ShoppingBag,Shirt,Sun,House,Palmtree,MessageCircle,Upload,Tv,Newspaper,Smile,Music,Leaf,X,Check} from 'lucide-react';
import {ageFor,ageEffects,DAYS_PER_YEAR,HOMES,SHOPPING,RETIREMENT,shoppingError,laundryError,housingError,retirementError} from './life.js';
import {jobFor} from './career.js';
import {TV_CHANNELS} from './entertainment.js';
import {activeDialogue,documentsFor,parseDialogueDocument} from './dialogue.js';
import './life.css';
import {utilities} from './finance.js';

export function LifePanel({game,onCommand,onLife,onUpgrade,onDialogue,onCalendar,onBills,onMood}) {
  const [confirm,setConfirm]=useState(null),[error,setError]=useState('');
  const file=useRef(null),l=game.life,age=ageFor(game),home=HOMES[l.housing];
  const housingBlocked=housingError(game,jobFor(game.career.jobId)?.salary||0),retireBlocked=retirementError(game);
  const shoppingBlocked=shoppingError(game);
  async function importDocument(event){
    const value=event.target.files?.[0];event.target.value='';
    if(!value)return;
    try{
      if(value.size>200000)throw new Error('对话文档不能超过 200 KB');
      if(game.dialogue.documents.length>=12)throw new Error('最多导入 12 份对话文档');
      const document=parseDialogueDocument(await value.text());
      onDialogue({kind:'import',document});setError(`已导入：${document.title}`);
    }catch(e){setError(e instanceof SyntaxError?'文件不是有效的 JSON':e.message);}
  }
  return <div className="life-panel">
    <div className="daily-entry-buttons"><button onClick={onCalendar}><CalendarDays size={14}/>日历</button><button onClick={onBills}><Coins size={14}/>生活账单</button><button onClick={onMood}><Heart size={14}/>情绪来源</button></div>
    <div className="life-age"><strong>{age} 岁</strong><span>{ageEffects(game).label}{l.retired?' · 已退休':''}</span>
      <small>距生日 {DAYS_PER_YEAR-(game.sim.day-l.bornDay)%DAYS_PER_YEAR} 天</small></div>
    <div className="career-shift"><span>衣物</span><strong>{{
      dirty:'待清洗',washing:'清洗中',wet:'已洗好，待晾晒',hanging:'晾晒中',drying:'晾干中',clean:'干净整洁',
    }[l.laundry.stage]}</strong></div>
    <div className="life-actions">
      <button disabled={!!laundryError(game,'wash')} onClick={()=>onCommand({kind:'laundry',task:'wash'})}><Shirt size={14}/>洗衣服</button>
      <button disabled={!!laundryError(game,'hang')} onClick={()=>onCommand({kind:'laundry',task:'hang'})}><Sun size={14}/>晾晒衣物</button>
      <button disabled={!!shoppingBlocked} title={shoppingBlocked||''} onClick={()=>onCommand({kind:'shopping'})}><ShoppingBag size={14}/>出门购物 <small>{SHOPPING.price} 币 · 90 分钟</small></button>
    </div>
    <section className="life-milestone"><div><House size={15}/><strong>{home?home.name:'宽庭别墅'}</strong></div>
      {home&&<><span>{home.width*home.depth} m² · {home.price.toLocaleString()} 生活币</span>
        <button className="career-command" disabled={!!housingBlocked} title={housingBlocked||''} onClick={()=>setConfirm('home')}><House size={14}/>升级住宅</button>
        {housingBlocked&&<small>{housingBlocked}</small>}</>}
    </section>
    <section className="life-milestone"><div><Palmtree size={15}/><strong>{l.retired?'退休生活':age<60?'提前退休':'办理退休'}</strong></div>
      {l.retired?<small>每日养老金 {RETIREMENT.pension} 生活币</small>:<>
        <button className="career-command" disabled={!!retireBlocked} title={retireBlocked||''} onClick={()=>setConfirm('retire')}><Palmtree size={14}/>{age<60?'提前退休':'办理退休'}</button>
        {retireBlocked&&<small>{retireBlocked}</small>}
      </>}
    </section>
    {confirm&&<div className="life-confirm" role="group" aria-label="确认人生决定">
      <span>{confirm==='home'?`确认花费 ${home.price.toLocaleString()} 生活币搬家？`:'确认离职并进入退休生活？'}</span>
      <button onClick={()=>{confirm==='home'?onUpgrade():onLife({kind:'retire'});setConfirm(null);}}><Check size={14}/>确认</button>
      <button onClick={()=>setConfirm(null)}><X size={14}/>取消</button>
    </div>}
    <section className="life-milestone"><div><MessageCircle size={15}/><strong>相遇与对话</strong></div>
      {documentsFor(game).filter(d=>d.id!=='colleague').map(doc=>{
        const done=game.dialogue.history.some(h=>h.day===game.sim.day&&h.documentId===doc.id&&h.contact==='online-friend');
        return <button key={doc.id} className="career-command" disabled={done||!!l.shopping||game.career.location==='office'||!utilities(game).phone}
          onClick={()=>onDialogue({kind:'open',documentId:doc.id,contact:'online-friend',name:'好友知夏'})}>
          <MessageCircle size={14}/>{doc.title}{done?' · 今日已聊':''}</button>;
      })}
      <button className="career-text" onClick={()=>file.current?.click()}><Upload size={13}/>导入对话文档</button>
      <a className="career-text" href={`${import.meta.env.BASE_URL}dialogue-example.json`} download>对话模板 JSON</a>
      <input className="file-input" type="file" ref={file} accept=".json,application/json" aria-label="导入对话文档" onChange={importDocument}/>
      {error&&<small role="status">{error}</small>}
    </section>
  </div>;
}

export function DialoguePanel({game,onAction}){
  const current=activeDialogue(game);
  if(!current)return null;
  const visited=current.visited.includes(current.nodeId);
  return <div className="dialogue-panel">
    <div className="dialogue-speaker"><MessageCircle size={19}/><strong>{current.name}</strong><span>{current.node.speaker}</span></div>
    <p>{current.node.text}</p>
    <div className="dialogue-choices">{!visited&&current.node.choices.map(choice=><button key={choice.id}
      disabled={!!choice.requiresFlag&&!game.dialogue.flags.includes(choice.requiresFlag)}
      onClick={()=>onAction({kind:'choose',choiceId:choice.id})}>{choice.label}</button>)}</div>
    {(!current.node.choices.length||visited)&&<button className="primary-button" onClick={()=>onAction({kind:'close'})}>结束交谈</button>}
  </div>;
}

export function TelevisionMenu({anchor,onSelect,onClose}){
  const ref=useRef(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  const icons={nature:Leaf,news:Newspaper,comedy:Smile,music:Music};
  const x=Math.max(146,Math.min(window.innerWidth-146,anchor?.x||window.innerWidth/2));
  const y=Math.max(200,Math.min(window.innerHeight-210,anchor?.y||window.innerHeight/2));
  return <dialog ref={ref} className="tv-radial" aria-label="电视节目" style={{left:x,top:y}} onCancel={e=>{e.preventDefault();onClose();}}
    onClick={e=>{if(e.target===ref.current)onClose();}}>
    <button className="tv-center" aria-label="关闭电视选台" title="关闭电视选台" onClick={onClose}><Tv size={25}/></button>
    {Object.entries(TV_CHANNELS).map(([id,channel],i)=>{
      const Icon=icons[id];
      return <button key={id} className={`tv-channel tv-channel-${i}`} onClick={()=>onSelect(id)}>
        <Icon size={18}/><span>{channel.label}</span></button>;
    })}
  </dialog>;
}
