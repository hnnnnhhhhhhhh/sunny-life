import React,{useState} from 'react';
import {ChevronLeft,ChevronRight,Plus,Trash2,Coins,Check,CalendarDays,Zap,Droplets,Phone,Wifi,Heart,MessageCircle,Users,LogOut,ShoppingBag,HandHeart,Sun,Moon} from 'lucide-react';
import {WEEKDAYS,monthFor,dateFor,workday} from './calendar.js';
import {BILL_TYPES,utilities} from './finance.js';
import {jobFor,jobHours} from './career.js';
import {FRIENDS,contactFor,SOCIAL_ACTIONS,socialActionError,visitError,friendById} from './social.js';
import {EMOTIONS,emotionProfile} from './emotions.js';
import {DEFAULT_AVATAR} from './game.js';
import './daily-panels.css';
export function CalendarPanel({game,onAction}){
  const [month,setMonth]=useState(monthFor(game.sim.day)),[day,setDay]=useState(game.sim.day),[title,setTitle]=useState(''),[clock,setClock]=useState('18:00');
  const first=(month-1)*28+1,job=jobFor(game.career.jobId),events=game.calendar.events.filter(e=>e.day===day).sort((a,b)=>a.time-b.time);
  const due=game.finance.invoices.filter(i=>i.due===day);
  const add=event=>{event.preventDefault();const [h,m]=clock.split(':').map(Number);onAction({kind:'add',day,title,time:h*60+m});setTitle('');};
  return <div className="daily-panel calendar-panel">
    <div className="daily-heading"><button title="上个月" aria-label="上个月" disabled={month<=1} onClick={()=>setMonth(m=>m-1)}><ChevronLeft size={19}/></button>
      <h3>第 {month} 月</h3><button title="下个月" aria-label="下个月" disabled={month>=monthFor(game.sim.day)+4} onClick={()=>setMonth(m=>m+1)}><ChevronRight size={19}/></button>
      <button className="daily-today" onClick={()=>{setMonth(monthFor(game.sim.day));setDay(game.sim.day);}}>今天</button></div>
    <div className="calendar-week">{WEEKDAYS.map(d=><span key={d}>{d}</span>)}</div>
    <div className="calendar-grid">{Array.from({length:28},(_,i)=>{
      const value=first+i,hasBill=value>=game.finance.nextDue&&(value-game.finance.nextDue)%28===0||game.finance.invoices.some(b=>b.due===value);
      const own=game.calendar.events.some(e=>e.day===value);
      return <button key={value} aria-label={`第${month}月${i+1}日 ${WEEKDAYS[i%7]}`} aria-pressed={day===value}
        data-today={value===game.sim.day} onClick={()=>setDay(value)}><strong>{i+1}</strong>
        <span>{job&&workday(value)?'班':'休'}</span><div>{hasBill&&<Coins size={10}/>} {own&&<CalendarDays size={10}/>}</div></button>;
    })}</div>
    <section className="daily-section"><h3>{dateFor(day).month} 月 {dateFor(day).date} 日 · {dateFor(day).weekday}</h3>
      <p>{job&&workday(day)?`${job.title} · ${jobHours(job)}`:'休息日'}{game.career.attendance.leaveDay===day?' · 已请假':''}</p>
      {day>=game.finance.nextDue&&(day-game.finance.nextDue)%28===0&&<p>房租与公共服务账单日</p>}
      {due.map(b=><p key={b.id}>{BILL_TYPES[b.kind].label} · {b.amount} 币 · {b.paid?'已缴':'待缴'}</p>)}
      {game.career.attendance.records.filter(r=>r.day===day).map((r,i)=><p key={i}>出勤：{{present:'正常',late:`迟到 ${r.minutes} 分钟`,absent:'旷工',leave:'请假'}[r.kind]}</p>)}
      <ul className="calendar-events">{events.map(e=><li key={e.id}><span>{String(Math.floor(e.time/60)).padStart(2,'0')}:{String(e.time%60).padStart(2,'0')} · {e.title}</span>
        <button aria-label={`删除日程${e.title}`} title="删除日程" onClick={()=>onAction({kind:'remove',id:e.id})}><Trash2 size={15}/></button></li>)}</ul>
      <form className="calendar-form" onSubmit={add}><input aria-label="日程名称" placeholder="日程名称" maxLength={60} value={title} onChange={e=>setTitle(e.target.value)}/>
        <input aria-label="日程时间" type="time" required value={clock} onChange={e=>setClock(e.target.value)}/>
        <button aria-label="添加日程" title="添加日程" disabled={!title.trim()||day<game.sim.day||day>game.sim.day+112||game.calendar.events.length>=32}><Plus size={18}/></button></form>
    </section>
  </div>;
}
export function BillsPanel({game,onAction}){
  const f=game.finance,u=utilities(game);
  return <div className="daily-panel">
    <div className="daily-heading"><h3>待缴 {u.debt.toLocaleString()} 生活币</h3><span>下次出账：第 {f.nextDue} 天</span></div>
    <p className="daily-meta">{game.life.housing?'自有住宅，按期支付维护费':`当前月租 ${f.rent.toLocaleString()} 生活币`}</p>
    <label className="daily-toggle"><span>余额充足时自动缴费</span><input type="checkbox" role="switch" aria-label="自动缴费" checked={f.autoPay} onChange={e=>onAction({kind:'autoPay',value:e.target.checked})}/></label>
    <div className="service-status">{[[Zap,'power','供电'],[Droplets,'water','供水'],[Phone,'phone','电话'],[Wifi,'internet','网络']].map(([Icon,key,label])=><span key={key} data-off={!u[key]}><Icon size={15}/>{label} · {u[key]?'正常':'已暂停'}</span>)}</div>
    <div className="bill-list">{[...f.invoices].sort((a,b)=>Number(a.paid)-Number(b.paid)||b.due-a.due).map(b=><div className="bill-row" key={b.id}>
      <span><strong>{BILL_TYPES[b.kind].label}</strong><small>第 {b.due} 天到期{!b.paid&&game.sim.day>=b.due+BILL_TYPES[b.kind].grace?' · 已逾期':''}</small></span>
      <b>{b.amount.toLocaleString()}</b><button title={b.paid?'已缴费':game.budget<b.amount?'余额不足':'缴费'}
        aria-label={`缴纳${BILL_TYPES[b.kind].label} ${b.amount}`} disabled={b.paid||game.budget<b.amount} onClick={()=>onAction({kind:'pay',id:b.id})}>{b.paid?<Check size={17}/>:<Coins size={17}/>}</button>
    </div>)}</div>
    {!f.invoices.length&&<p className="daily-meta">本期尚未出账</p>}
  </div>;
}
export function SocialPanel({game,Portrait,onInvite,onAction,onInteract,onOuting,initialId}){
  const [id,setId]=useState(initialId||FRIENDS[0].id),[group,setGroup]=useState([FRIENDS[0].id]);
  const friend=friendById(id),c=contactFor(game,id),visit=game.social.visit,present=visit?.ids.includes(id)&&visit.stage==='active';
  const icons={talk:MessageCircle,joke:Sun,listen:HandHeart,flirt:Heart,confess:Heart,apologize:HandHeart,affection:Heart,breakup:LogOut};
  return <div className="daily-panel social-panel">
    <div className="friend-list">{FRIENDS.map(f=><button key={f.id} aria-pressed={id===f.id} onClick={()=>setId(f.id)}>
      <Portrait avatar={{...DEFAULT_AVATAR,...f.avatar,name:f.name}}/><span>{f.name}<small>{f.age} 岁</small></span></button>)}</div>
    <div className="daily-heading"><h3>{friend.name}</h3><span>{{friend:'朋友',dating:'互有好感',partner:'恋人',ex:'前任'}[c.relationship]}</span></div>
    <p className="daily-meta">{friend.trait}</p>
    <div className="relationship-meters">{[['friendship','友谊'],['romance','爱慕'],['trust','信任'],['satisfaction','相处满意度']].map(([key,label])=><label key={key}><span>{label}<b>{Math.round(c[key])}</b></span><meter aria-label={label} min="0" max="100" value={c[key]}/></label>)}</div>
    {c.resentment>0&&<p className="daily-warning">尚未消散的芥蒂 {Math.round(c.resentment)}</p>}
    <div className="social-commands">
      {!present&&<button disabled={!!visitError(game,[id])} title={visitError(game,[id])||''} onClick={()=>onInvite([id],'chat')}><MessageCircle size={15}/>邀请来家聊天</button>}
      {!present&&<button disabled={!!visitError(game,[id],'date')} title={visitError(game,[id],'date')||''} onClick={()=>onInvite([id],'date')}><Heart size={15}/>安排居家约会</button>}
      {!visit&&<button disabled={game.career.location==='office'||game.budget<80||!utilities(game).phone||!!game.life.shopping} onClick={()=>onOuting(id)}><ShoppingBag size={15}/>一起出去玩 <small>80 币</small></button>}
      {present&&Object.entries(SOCIAL_ACTIONS).map(([verb,a])=>{
        const error=socialActionError(game,id,verb),Icon=icons[verb];
        return <button key={verb} disabled={!!error||!!game.social.interaction} title={error||`${a.duration} 分钟`} onClick={()=>onInteract(id,verb)}><Icon size={15}/>{a.label}</button>;
      })}
    </div>
    {visit&&<div className="daily-section"><p>{visit.ids.map(id=>friendById(id).name).join('、')} · {{arriving:'正在来访',active:'在家做客',leaving:'正在离开'}[visit.stage]}</p>
      <button className="career-command" disabled={visit.stage==='leaving'} onClick={()=>onAction({kind:'dismiss'})}><LogOut size={15}/>送朋友回家</button></div>}
    {!visit&&<section className="daily-section"><h3>周末小聚</h3><div className="party-guests">{FRIENDS.map(f=><label key={f.id}><input type="checkbox" checked={group.includes(f.id)} onChange={e=>setGroup(ids=>e.target.checked?[...ids,f.id]:ids.filter(id=>id!==f.id))}/>{f.name}</label>)}</div>
      <button className="career-command" disabled={!!visitError(game,group,'party')} onClick={()=>onInvite(group,'party')}><Users size={15}/>邀请聚会 · 60 币</button></section>}
    {!!game.social.history.length&&<section className="daily-section"><h3>最近相处</h3>{game.social.history.slice(-4).reverse().map((h,i)=><p key={i}>第 {h.day} 天 · {friendById(h.id).name} · {h.text}</p>)}</section>}
  </div>;
}
export function MoodPanel({game,onReflection}){
  const profile=emotionProfile(game);
  return <div className="daily-panel">
    <div className="daily-heading"><h3>{profile.dominant?EMOTIONS[profile.dominant].label:'平静日常'}</h3><span>烦躁 {Math.round(profile.irritability)} · 安心 {Math.round(profile.safety)}</span></div>
    <div className="mood-sources">{profile.sources.map((s,i)=><div key={i}><i style={{background:EMOTIONS[s.emotion].color}}/><span>{s.source}<small>{EMOTIONS[s.emotion].label} · 影响 {Math.round(s.weight)}</small></span></div>)}</div>
    {game.emotions.effects.map(e=><p className="daily-meta" key={e.id}>{e.source} · 剩余 {Math.ceil(e.remaining)} 分钟</p>)}
    <section className="daily-section"><h3>现实心情记录</h3><div className="social-commands">{[['stress','今天工作不顺'],['tired','今天感到疲惫'],['joy','今天有件开心事']].map(([kind,label])=><button key={kind} disabled={game.emotions.reflectionDay===game.sim.day} onClick={()=>onReflection(kind)}><Heart size={14}/>{label}</button>)}</div></section>
  </div>;
}
export function ConflictPanel({game,onResolve}){
  const c=game.social.conflict;
  if(!c)return null;
  return <div className="daily-panel conflict-panel"><h3>{friendById(c.friendId).name}察觉到了你的情绪</h3>
    <p>“你今天好像有点不耐烦，是我哪里做得不对吗？”</p><p className="daily-warning">正在影响这次相处：{c.source}</p>
    <div className="dialogue-choices">{[['explain','说明今天的不顺，别让对方误会'],['space','先独处十分钟，再继续聊'],['lash','把不满发泄到对方身上']].map(([choice,label])=><button key={choice} onClick={()=>onResolve({kind:'resolveConflict',id:c.id,choice})}>{label}</button>)}</div>
  </div>;
}
export function AttendancePanel({game,onAction}){
  const a=game.career.attendance;
  return <div className="daily-panel"><h3>累计旷工 {a.absences} 次</h3>
    <p className="daily-meta">无故缺勤不计工资；连续记录会影响任职。</p>
    {a.review&&<div className="dialogue-choices"><button disabled={a.probationUsed} onClick={()=>onAction({kind:'review',choice:'plan'})}>申请一次出勤改进机会</button>
      <button onClick={()=>onAction({kind:'review',choice:'accept'})}>接受解除任职，重新求职</button></div>}
    <ul className="calendar-events">{a.records.slice(-12).reverse().map((r,i)=><li key={i}>第 {r.day} 天 · {{present:'正常出勤',late:`迟到 ${r.minutes} 分钟`,absent:'旷工',leave:'事先请假'}[r.kind]}</li>)}</ul>
  </div>;
}
