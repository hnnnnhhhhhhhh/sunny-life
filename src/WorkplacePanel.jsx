import React,{useState} from 'react';
import {ClipboardList,Send,Users,History,MessageCircle,FileCheck2,Clock3,TriangleAlert,Handshake,Focus,Eye} from 'lucide-react';
import {jobFor,clockText} from './career.js';
import {castForRank,castById,relationshipRole,npcStatus} from './workplace-cast.js';
import {WORK_EVENTS,STORY_TITLES} from './workplace-stories.js';
import {completion,currentChapter,appraisalChoices} from './workplace.js';
import {NPC_APPEARANCES} from './office-people.js';
import './workplace.css';
const minutes=n=>`${Math.round(n)} 分钟`;
export function WorkSummary({game,onOpen,onEvent}){
  const w=game.career.workplace,p=w?.project;
  if(!w)return null;
  return <section className="work-summary">
    {p&&<><div><strong>{p.title}</strong><output>{Math.round(completion(p)*100)}%</output></div>
      <progress aria-label="主任务完成度" max={p.required} value={p.done}/>
      <small>预计 {minutes(p.required)} · 已被打断 {minutes(p.interrupted)}</small></>}
    <div><span>绩效 {w.performance}</span><span className={w.warnings?'work-risk':''}>警告 {w.warnings} / 3</span></div>
    {w.event&&<button className="career-command" onClick={onEvent}><MessageCircle size={14}/>{w.event.type==='appraisal'?'处理绩效复核':'处理工作来讯'}</button>}
    <button className="career-command" onClick={onOpen}><ClipboardList size={14}/>职场事务与人物</button>
  </section>;
}
export function WorkNotice({game,onOpen}){
  const e=game.career.workplace?.event;
  if(!e)return null;
  return <button className="work-notice surface" onClick={onOpen}>
    <MessageCircle size={17}/><span><strong>{e.type==='appraisal'?'绩效复核待处理':castById(e.npcId).name+' 来讯'}</strong>
      <small>{e.type==='appraisal'?'任职风险已进入复核阶段':WORK_EVENTS[e.type].title}</small></span>
    {e.type!=='appraisal'&&<output>{Math.max(0,Math.ceil(30-e.waited))} 分</output>}
  </button>;
}
export function WorkEventBody({game,onAction,Portrait}){
  const w=game.career.workplace,e=w.event;
  if(!e)return <p>这条来讯已经处理。</p>;
  const review=e.type==='appraisal',def=WORK_EVENTS[e.type],npc=castById(e.npcId);
  const choices=review?appraisalChoices(game):def.choices;
  const last=w.reviews.at(-1);
  return <div className="work-event">
    <div className="work-speaker"><Portrait avatar={NPC_APPEARANCES[e.npcId]}/><div><strong>{npc.name}</strong><small>{review?'绩效复核':relationshipRole(e.npcId,w.supervisor)+' · '+npc.title}</small></div></div>
    <p>{review?`连续低绩效已触发解除任职建议。最近评审 ${last.score} 分，累计 ${w.warnings} 次警告。已挣工资照常结算，你可以提交证据复核，或申请一次改进机会。`:def.text}</p>
    <div className="work-event-context"><Clock3 size={14}/>{review?`证据 ${last.evidence} · 同步 ${last.communication}`:
      `主任务剩余 ${Math.ceil(Math.max(0,w.project.required-w.project.done))} 分钟 · 已被打断 ${Math.round(w.project.interrupted)} 分钟`}</div>
    <div className="work-choices">{choices.map(choice=><button key={choice.id} disabled={choice.disabled}
      onClick={()=>onAction({kind:'resolve',eventId:e.id,choiceId:choice.id})}>
      <strong>{choice.label}</strong><small>{choice.outcome}</small></button>)}</div>
  </div>;
}
export function WorkplacePanel({game,onAction,onEvent,Portrait,initialPerson,onFocus}){
  const [tab,setTab]=useState(initialPerson?'people':'project'),[selected,setSelected]=useState(initialPerson||'danbao');
  const c=game.career,w=c.workplace,p=w.project,job=jobFor(c.jobId);
  const rank=job?.rank||p?.rank||1,people=castForRank(rank),person=people.find(n=>n.id===selected)||people[0],n=w.npcs[person.id];
  const working=c.location==='office'&&c.phase==='working'&&p&&!p.reviewed;
  const ready=working&&!w.event&&!p.overhead;
  const act=(kind,extra={})=>onAction({kind,...extra});
  return <div className="work-center">
    <nav className="work-tabs" aria-label="职场事务分类">{[
      ['project','项目',ClipboardList],['people','人物与交接',Users],['history','主线与记录',History],
    ].map(([id,label,Icon])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}><Icon size={15}/>{label}</button>)}</nav>
    {tab==='project'&&<>
      <div className="work-project-heading"><div><small>{job?.company||'职业档案'}</small><h3>{p?.title||'下一次出勤时领取主任务'}</h3></div>
        <span className={w.warnings?'work-risk':''}>绩效 {w.performance} · 警告 {w.warnings}/3</span></div>
      {p&&<>
        <div className="work-progress-label"><strong>{Math.round(completion(p)*100)}%</strong><span>{p.reviewed?'已评审':p.submitted?'已提交':w.event?'等待来讯处理':p.overhead>0?p.overheadLabel:'主任务进行中'}</span></div>
        <progress aria-label="项目完成度" max={p.required} value={p.done}/>
        <dl className="work-ledger"><dt>预计总工作量</dt><dd>{minutes(p.required)}</dd><dt>专注时间</dt><dd>{minutes(p.focused)}</dd>
          <dt>被打断时间</dt><dd className="work-risk">{minutes(p.interrupted)}</dd><dt>待完成工作</dt><dd>{minutes(p.required-p.done)}</dd>
          <dt>截止时间</dt><dd>{job?clockText(job.end):'已结算'}</dd><dt>贡献份额</dt><dd>{Math.round(p.credit)}%</dd>
          <dt>书面证据</dt><dd>{Math.round(p.evidence)}</dd><dt>进度同步</dt><dd>{Math.round(p.communication)}</dd></dl>
        <div className="work-commands">
          <button disabled={!ready||p.spent-p.lastReport<60} onClick={()=>act('report')}><Send size={15}/>同步进度与依赖 <small>10 分钟</small></button>
          <button disabled={!ready||p.submitted||completion(p)<.6} onClick={()=>act('submit')}><FileCheck2 size={15}/>提交当前版本 <small>10 分钟</small></button>
          {w.event&&<button onClick={onEvent}><MessageCircle size={15}/>{w.event.type==='appraisal'?'处理绩效复核':'处理工作来讯'}</button>}
        </div>
        {p.overhead>0&&!p.reviewed&&<div className="work-inline-status" role="status"><Clock3 size={14}/>{p.overheadLabel} · 剩余 {minutes(p.overhead)}</div>}
      </>}
      {w.reviews.at(-1)&&<div className="work-review"><strong>最近评审：{w.reviews.at(-1).outcome}</strong><p>{w.reviews.at(-1).feedback}</p></div>}
      {w.dismissed&&<div className="work-review"><TriangleAlert size={16}/><strong>第 {w.dismissed.day} 天解除任职</strong><p>{w.dismissed.reason}。资历和已挣工资保留。</p></div>}
    </>}
    {tab==='people'&&<>
      <div className="work-people-list">{people.map(npc=><button key={npc.id} aria-pressed={person.id===npc.id}
        onClick={()=>setSelected(npc.id)}><Portrait avatar={NPC_APPEARANCES[npc.id]}/><span><strong>{npc.name}</strong><small>{npc.title}</small></span></button>)}</div>
      <section className="work-person-detail">
        <div className="work-project-heading"><h3>{person.name}</h3><span>{relationshipRole(person.id,w.supervisor)}</span>
          <button aria-label={`查看${person.name}位置`} title="查看人物位置" disabled={c.location!=='office'} onClick={()=>onFocus(person.id)}><Focus size={18}/></button></div>
        <blockquote>{person.line}</blockquote>
        <div className="work-person-meta"><span>亲近 {Math.round(n.closeness)}</span><span>信任 {Math.round(n.trust)}</span>
          <span>关注 {Math.round(n.interest)}</span><span>{npcStatus(n)}</span></div>
        <small className="work-knowledge"><Eye size={13}/>{n.informed?`已获知 ${Math.round(n.known*100)}% 的项目进展`:'尚未收到本项目进展'}</small>
        <div className="work-inline-status"><Handshake size={15}/>{person.help}</div>
        {n.assignment&&<div className="work-handoff"><strong>{{
          promised:'已口头答应，尚未交付',done:'已有实际产物，等待验收',collected:'交接已验收',
        }[n.assignment.status]}</strong><progress aria-label={`${person.name}交接进度`} max={n.assignment.delay+n.assignment.duration} value={Math.min(n.assignment.elapsed,n.assignment.delay+n.assignment.duration)}/></div>}
        <div className="work-commands">
          <button disabled={!ready||p.submitted||p.requests.includes(person.id)||person.minRank>1&&['zhuoge','dayanzei'].includes(person.id)&&completion(p)<.2}
            onClick={()=>act('handoff',{npcId:person.id,task:'small'})}><Handshake size={15}/>交接明确小任务</button>
          <button disabled={!ready||p.submitted||p.requests.includes(person.id)||['zhuoge','dayanzei'].includes(person.id)&&completion(p)<.2}
            onClick={()=>act('handoff',{npcId:person.id,task:'complex'})}><ClipboardList size={15}/>交接开放式任务</button>
          <button disabled={!ready||n.assignment?.status!=='promised'||p.requests.includes(`follow-${person.id}`)}
            onClick={()=>act('followup',{npcId:person.id})}><Clock3 size={15}/>确认交付时间</button>
          <button disabled={!ready||p.submitted||n.assignment?.status!=='done'} onClick={()=>act('collect',{npcId:person.id})}><FileCheck2 size={15}/>验收交接产物</button>
        </div>
        {rank>=2&&['danbao','shuijie'].includes(person.id)&&<button className="career-command" disabled={c.location!=='home'||!!w.event||w.supervisor===person.id}
          onClick={()=>act('supervisor',{npcId:person.id})}><Users size={15}/>{w.supervisor===person.id?'当前直属组长':'下一班转入此组'}</button>}
      </section>
    </>}
    {tab==='history'&&<>
      <div className="work-project-heading"><h3>职场主线</h3><span>已完成项目 {w.reviews.length}</span></div>
      <ol className="work-story">{STORY_TITLES.slice(0,Math.max(1,currentChapter(w)+1)).map((title,i)=><li key={title} data-complete={i<currentChapter(w)}><span>{i+1}</span><strong>{title}</strong><small>{i<currentChapter(w)?'已发生':'进行中'}</small></li>)}</ol>
      <h3 className="work-journal-title">交接与决定记录</h3>
      <ol className="work-journal">{[...w.journal].reverse().map((entry,i)=><li key={`${entry.day}-${entry.time}-${i}`}><small>第 {entry.day} 天 · {clockText(entry.time)} · {castById(entry.npcId).name}</small><p>{entry.text}</p></li>)}</ol>
      {!w.journal.length&&<p className="work-empty">尚无项目记录。</p>}
    </>}
  </div>;
}
