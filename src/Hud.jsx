import React, { useEffect,useState } from 'react';
import { CalendarDays,House,BriefcaseBusiness,ChevronDown, ChevronUp, Heart, Leaf, MessageCircle, Pause, Play, Sparkles, Sun, Moon, Sunrise, Sunset, Monitor, Users, Utensils, X, Zap, Smile, Pencil, Toilet, ShowerHead, ListOrdered, Fish, Footprints, Trash2 } from 'lucide-react';
import { isApartment } from './residence.js';
import { daylightAt } from './daylight.js';
import {CareerPanel} from './CareerPanel.jsx';
import {atWork,residentMood,workStatus} from './career.js';
import {moodState,needLevel,NEED_LEVELS} from './needs.js';
import {LifePanel} from './LifePanel.jsx';
import {weekdayText} from './calendar.js';

const NEEDS = [
  { key: 'hunger', label: '饱腹', icon: Utensils, color: '#bb985d' },
  { key: 'energy', label: '精力', icon: Zap, color: '#78a184' },
  { key: 'social', label: '社交', icon: Heart, color: '#bb897f' },
  { key: 'fun', label: '愉悦', icon: Smile, color: '#7b9fad' },
  { key: 'hygiene', label: '清洁', icon: ShowerHead, color: '#6eaaa9' },
  { key: 'bladder', label: '如厕', icon: Toilet, color: '#9a8daf' },
];
const TABS = [{ id: 'needs', label: '需求', icon: Heart }, { id: 'traits', label: '特质', icon: Sparkles }, { id: 'neighbors', label: '邻居', icon: Users },{id:'career',label:'职业',icon:BriefcaseBusiness},{id:'life',label:'生活',icon:House}];

function Tool({ icon: Icon, label, ...props }) {
  return <button className="hud-tool" aria-label={label} title={label} {...props}><Icon size={16} strokeWidth={1.7} /></button>;
}

export function ResidentPanel({ game, activity, walking, Portrait, onEdit, onCancel, neighbors, onChat, onOnlineChat, onPlaceComputer, onTabKey, onAutonomy, queue, onRemoveQueue, onClearQueue, onMoveQueue,onJobSearch,onDepart,onCareerAction,careerFocus,onLifeCommand,onLife,onUpgrade,onDialogue,onWorkplace,onWorkEvent,onCalendar,onBills,onSocial,onMood,onAttendance }) {
  const [tab, setTab] = useState('needs');
  const apartment=isApartment(game.home),hasComputer=game.home.furniture.some(f=>f.type==='desk');
  const tabs=TABS.map(t=>t.id==='neighbors'&&apartment?{...t,label:'社交',icon:Monitor}:t);
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const office=atWork(game),mood=residentMood(game),moodInfo=moodState(game);
  useEffect(()=>{if(office||careerFocus){setTab('career');setCollapsed(office&&window.matchMedia('(max-width:760px)').matches);}},[office,careerFocus]);
  return <aside className={`resident-panel surface ${collapsed ? 'is-collapsed' : ''} ${tab==='career'?'career-tab':''} ${tab==='life'?'life-tab':''}`} aria-label="居民状态面板">
    <div className="resident-panel-heading">
      <button className="resident" aria-label={`编辑${game.avatar.name}`} disabled={office} onClick={onEdit}><Portrait avatar={game.avatar} /><span><strong>{game.avatar.name}</strong><small title={moodInfo.cause} data-mood={moodInfo.severity} style={{color:moodInfo.color}}><span className="status-dot" style={{background:moodInfo.color}}/>{mood}</small></span></button>
      <Tool icon={collapsed ? ChevronUp : ChevronDown} label={collapsed ? '展开居民面板' : '收起居民面板'} onClick={() => setCollapsed(value => !value)} />
    </div>
    {(activity || walking) && <div className="hud-activity">
      {['chat','onlineChat'].includes(activity?.type) ? <MessageCircle size={13} /> : <Leaf size={13} />}
      <span>{activity?.label || '散步中'}</span>
      <Tool icon={X} label="取消当前活动" onClick={onCancel} />
    </div>}
    {activity && <div className="activity-progress"><span style={{ width: `${activity.progress}%` }} /></div>}
    {office&&<div className="hud-activity"><BriefcaseBusiness size={13}/><span>{workStatus(game).label}</span></div>}
    {queue.length>0 && <section className="action-queue" aria-label="任务队列">
      <div className="queue-heading"><ListOrdered size={13}/><span>待办 {queue.length}</span><Tool icon={Trash2} label="清空待办队列" onClick={onClearQueue}/></div>
      <ol>{queue.map((item,i)=>{
        const Icon=item.kind==='fish'?Fish:item.kind==='chat'?MessageCircle:item.kind==='walk'?Footprints:Leaf;
        return <li key={item.id}><Icon size={12}/><span title={`${item.label} · ${item.detail}`}>{item.label}<small>{item.detail}</small></span>
          <Tool icon={ChevronUp} label={`提前${item.label}`} disabled={i===0} onClick={()=>onMoveQueue(item.id)}/>
          <Tool icon={X} label={`移除待办${item.label}`} onClick={()=>onRemoveQueue(item.id)}/></li>;
      })}</ol>
    </section>}
    {!collapsed && <>
      <div className="resident-panel-content" id="resident-info-panel" role="tabpanel" aria-labelledby={`resident-tab-${tab}`}>
        {tab === 'needs' && <div className="needs">{NEEDS.map(({ key, label, icon: Icon }) => <div className="need" key={key} data-level={needLevel(game.sim.needs[key])} style={{ '--need-color': NEED_LEVELS[needLevel(game.sim.needs[key])].color }}>
          <div><Icon size={12} /><span>{label}</span><strong>{Math.round(game.sim.needs[key])}</strong></div>
          <meter min={0} max={100} value={game.sim.needs[key]} aria-label={label} aria-valuetext={`${Math.round(game.sim.needs[key])}，${NEED_LEVELS[needLevel(game.sim.needs[key])].label}`} />
        </div>)}</div>}
        {tab==='needs'&&<button className="mood-link" onClick={onMood}><Heart size={12}/>查看情绪来源</button>}
        {tab === 'traits' && <div className="hud-traits">{game.avatar.traits.map(trait => <span key={trait}><Sparkles size={13} />{trait}</span>)}<button onClick={onEdit}><Pencil size={13} />编辑居民</button></div>}
        {tab==='career'&&<CareerPanel game={game} onSearch={onJobSearch} onPlaceComputer={onPlaceComputer} onDepart={onDepart} onAction={onCareerAction} onDialogue={onDialogue} onWorkplace={onWorkplace} onWorkEvent={onWorkEvent} onAttendance={onAttendance}/>}
        {tab==='life'&&<LifePanel game={game} onCommand={onLifeCommand} onLife={onLife} onUpgrade={onUpgrade} onDialogue={onDialogue} onCalendar={onCalendar} onBills={onBills} onMood={onMood}/>}
        {tab === 'neighbors' && <div className="hud-neighbors"><button className="career-command" onClick={onSocial}><Heart size={14}/>朋友与恋爱</button>{apartment?<div>
          <Monitor size={15}/><span>{hasComputer?'家中电脑':'未放置电脑'}</span>
          <Tool icon={hasComputer?MessageCircle:Pencil} label={hasComputer?'网上聊天':'放置电脑桌'} disabled={office} onClick={hasComputer?onOnlineChat:onPlaceComputer}/>
        </div>:neighbors.map(neighbor => <div key={neighbor.id}>
          <span className={`status-dot ${neighbor.busy ? 'busy' : ''}`} /><span>{neighbor.name}</span>
          <small>{neighbor.busy ? '交谈中' : '闲逛中'}</small><Tool icon={MessageCircle} label={`与${neighbor.name}聊天`} disabled={neighbor.busy} onClick={() => onChat(neighbor.id)} />
        </div>)}</div>}
      </div>
      <label className="autonomy-setting"><span>自主照料</span><input type="checkbox" role="switch" aria-label="自主照料" checked={game.sim.autonomy} onChange={event => onAutonomy(event.target.checked)} /></label>
      <nav className="resident-tabs" role="tablist" aria-label="居民信息" onKeyDown={onTabKey}>{tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`resident-tab-${id}`} role="tab" aria-controls="resident-info-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} title={label} onClick={() => setTab(id)}><Icon size={15} strokeWidth={1.7} /><span>{label}</span></button>)}</nav>
    </>}
  </aside>;
}

export function TimeControls({ sim, speed, setSpeed,onCalendar }) {
  const clock = `${String(Math.floor(sim.time / 60)).padStart(2, '0')}:${String(Math.floor(sim.time % 60)).padStart(2, '0')}`;
  const phase=daylightAt(sim.time).phase,Icon={day:Sun,night:Moon,dawn:Sunrise,dusk:Sunset}[phase];
  return <section className="time-controls surface" aria-label="时间与倍速">
    <div className="time-reading"><Icon size={14} aria-label={{day:'白天',night:'夜晚',dawn:'清晨',dusk:'黄昏'}[phase]}/><strong>{clock}</strong><span>{weekdayText(sim.day)} · 第 {sim.day} 天</span>
      <button className="daily-calendar-button" aria-label="打开日历" title="打开日历" onClick={onCalendar}><CalendarDays size={16}/></button></div>
    <div className="time-playback">
      <Tool icon={speed ? Pause : Play} label={speed ? '暂停生活' : '继续生活'} aria-pressed={speed === 0} onClick={() => setSpeed(value => value ? 0 : 1)} />
      {[1, 2, 3].map(value => <button key={value} aria-label={`${value}倍速`} aria-pressed={speed === value} className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)}>{value}<small>×</small></button>)}
    </div>
  </section>;
}
