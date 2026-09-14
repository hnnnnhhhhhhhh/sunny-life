import React from 'react';
import {BriefcaseBusiness,Search,Coins,Clock3,LogOut,Coffee,Utensils,Pause,Play,Monitor,Check,Toilet,MessageCircle,Palmtree} from 'lucide-react';
import {JOBS,REFRESHMENTS,atWork,departureError,jobFor,jobHours,newCareer,refreshmentError,workStatus,hiringError} from './career.js';
import './career.css';
import {WorkSummary} from './WorkplacePanel.jsx';
import {workday,monthFor} from './calendar.js';

const duration=minutes=>`${Math.floor(minutes/60)}时${Math.floor(minutes%60)}分`;
export function CareerPanel({game,onSearch,onPlaceComputer,onDepart,onAction,onDialogue,onWorkplace,onWorkEvent,onAttendance}){
  const c=game.career||newCareer(),job=jobFor(c.jobId),office=atWork(game),status=workStatus(game);
  const hasComputer=game.home.furniture.some(f=>f.type==='desk');
  if(game.life?.retired)return <div className="career-panel"><div className="career-job"><Palmtree size={22}/><strong>已退休</strong></div><span>累计工作收入 {c.totalEarned.toLocaleString()} 生活币</span></div>;
  if(!job)return <div className="career-panel">
    <div className="career-job"><BriefcaseBusiness size={22}/><span><strong>{c.workplace?.dismissed?'离职待业':'暂未入职'}</strong><small>青禾镇招聘</small></span></div>
    <button className="career-command" onClick={hasComputer?onSearch:onPlaceComputer}>
      {hasComputer?<Search size={15}/>:<Monitor size={15}/>} {hasComputer?'从电脑查找工作':'放置电脑桌'}
    </button>
    {c.workplace?.dismissed&&<WorkSummary game={game} onOpen={onWorkplace} onEvent={onWorkEvent}/>}
  </div>;
  const blocked=departureError(game);
  return <div className="career-panel">
    <div className="career-job"><BriefcaseBusiness size={20}/><span><strong>{job.title}</strong><small>{job.company}</small></span></div>
    <div className="career-shift"><span>{job.size} · 职级 {job.rank}</span><strong>资历 {Math.floor(c.qualification)}</strong></div>
    <div className="career-meta"><span><Coins size={12}/>{job.salary} / 天</span><span><Clock3 size={12}/>{jobHours(job)}</span></div>
    <div className="career-shift"><span>周一至周五</span><button className="career-text" onClick={onAttendance}>出勤记录{c.attendance.review?' · 待复核':''}</button></div>
    <WorkSummary game={game} onOpen={onWorkplace} onEvent={onWorkEvent}/>
    {office&&<>
      <div className="career-shift"><span>{status.label}</span><strong>{duration(c.shift.worked)}</strong></div>
      <progress aria-label="今日工作进度" max={job.end-job.start} value={c.shift.worked}/>
      <div className="career-shift"><span>今日累计</span><strong>{status.earned} 生活币</strong></div>
      <div className="career-pressure"><span>工作压力</span><meter min="0" max="100" value={c.stress} aria-label="工作压力"/><output>{Math.round(c.stress)}</output></div>
      <small className="career-continuous">连续工作 {duration(c.shift.continuous)}</small>
      <div className="career-actions">
        <button disabled={!['working','waiting','rest'].includes(c.phase)} onClick={()=>onAction({kind:'toilet'})}><Toilet size={13}/>去洗手间</button>
        {['break','rest'].includes(c.phase)?<button onClick={()=>onAction({kind:'resume'})}><Play size={13}/>继续工作</button>:
          <button disabled={c.phase!=='working'} onClick={()=>onAction({kind:'rest'})}><Pause size={13}/>休息 15 分钟</button>}
        {Object.entries(REFRESHMENTS).map(([key,item])=>{
          const error=refreshmentError(game,key),Icon=key==='coffee'?Coffee:Utensils;
          return <button key={key} disabled={!!error} title={error||`${item.label} ${item.price} 生活币`} onClick={()=>onAction({kind:'refreshment',refreshment:key})}>
            <Icon size={13}/>{item.label}<span>{item.price}</span>
          </button>;
        })}
      </div>
      <button className="career-command" disabled={c.phase==='leaving'} onClick={()=>onAction({kind:'leave'})}><LogOut size={14}/>{c.phase==='leaving'?'正在回家':'提前下班'}</button>
    </>}
    {!office&&<>
      <button className="career-command" disabled={!workday(game.sim.day)||game.sim.time>=job.start||c.attendance.leaveDay===game.sim.day||
        c.attendance.review||c.attendance.leaveMonth===monthFor(game.sim.day)&&c.attendance.leavesUsed>=2}
        onClick={()=>onAction({kind:'attendance',value:{kind:'leave'}})}><Pause size={14}/>{c.attendance.leaveDay===game.sim.day?'今日已请假':'事先请假'}</button>
      <button className="career-command" disabled={!!blocked} title={blocked||'出门上班'} onClick={onDepart}><BriefcaseBusiness size={14}/>{c.lastPaidDay===game.sim.day?'今日已结算':'出门上班'}</button>
      {blocked&&c.lastPaidDay!==game.sim.day&&<small className="career-continuous">{blocked}</small>}
      <button className="career-text" onClick={hasComputer?onSearch:onPlaceComputer}><Search size={13}/>{hasComputer?'查看其他工作':'放置电脑桌'}</button>
    </>}
    {c.lastPay&&<div className="career-pay"><Check size={13}/><span>第 {c.lastPay.day} 天 · {c.lastPay.reason}</span><strong>+{c.lastPay.amount}</strong></div>}
  </div>;
}

export function JobListings({game,onHire}){
  const active=game.career?.jobId;
  return <div className="job-listings">{JOBS.map(job=><article className="job-listing" key={job.id}>
    <div><span className="job-emblem" style={{background:job.color}}><BriefcaseBusiness size={20}/></span><h3>{job.title}<small>{job.company}</small></h3></div>
    <dl><dt>职级</dt><dd>{job.rank} · {job.size}</dd><dt>所需资历</dt><dd>{job.required}</dd><dt>日薪</dt><dd>{job.salary} 生活币</dd><dt>工作时间</dt><dd>{jobHours(job)}</dd><dt>工作内容</dt><dd>{job.task}</dd><dt>压力</dt><dd>{job.pressure<1?'适中':job.pressure<=1.5?'较高':'高'}</dd></dl>
    <button className="primary-button" title={hiringError(game,job.id)||''} disabled={active===job.id||!!hiringError(game,job.id)} onClick={()=>onHire(job.id)}>{active===job.id?<Check size={14}/>:<BriefcaseBusiness size={14}/>}{active===job.id?'当前工作':hiringError(game,job.id)||'选择并入职'}</button>
  </article>)}</div>;
}
