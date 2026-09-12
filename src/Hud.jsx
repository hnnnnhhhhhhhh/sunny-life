import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Heart, Leaf, MessageCircle, Pause, Play, Sparkles, Sun, Users, Utensils, X, Zap, Smile, Pencil, Toilet, ShowerHead, ListOrdered, Fish, Footprints, Trash2 } from 'lucide-react';

const NEEDS = [
  { key: 'hunger', label: '饱腹', icon: Utensils, color: '#bb985d' },
  { key: 'energy', label: '精力', icon: Zap, color: '#78a184' },
  { key: 'social', label: '社交', icon: Heart, color: '#bb897f' },
  { key: 'fun', label: '愉悦', icon: Smile, color: '#7b9fad' },
  { key: 'hygiene', label: '清洁', icon: ShowerHead, color: '#6eaaa9' },
  { key: 'bladder', label: '如厕', icon: Toilet, color: '#9a8daf' },
];
const TABS = [{ id: 'needs', label: '需求', icon: Heart }, { id: 'traits', label: '特质', icon: Sparkles }, { id: 'neighbors', label: '邻居', icon: Users }];

function Tool({ icon: Icon, label, ...props }) {
  return <button className="hud-tool" aria-label={label} title={label} {...props}><Icon size={16} strokeWidth={1.7} /></button>;
}

export function ResidentPanel({ game, activity, walking, Portrait, onEdit, onCancel, neighbors, onChat, onTabKey, onAutonomy, queue, onRemoveQueue, onClearQueue, onMoveQueue }) {
  const [tab, setTab] = useState('needs');
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const mood = Math.min(...Object.values(game.sim.needs)) < 25 ? '需要关心' : '惬意';
  return <aside className={`resident-panel surface ${collapsed ? 'is-collapsed' : ''}`} aria-label="居民状态面板">
    <div className="resident-panel-heading">
      <button className="resident" aria-label={`编辑${game.avatar.name}`} onClick={onEdit}><Portrait avatar={game.avatar} /><span><strong>{game.avatar.name}</strong><small><span className="status-dot" />{mood}</small></span></button>
      <Tool icon={collapsed ? ChevronUp : ChevronDown} label={collapsed ? '展开居民面板' : '收起居民面板'} onClick={() => setCollapsed(value => !value)} />
    </div>
    {(activity || walking) && <div className="hud-activity">
      {activity?.type === 'chat' ? <MessageCircle size={13} /> : <Leaf size={13} />}
      <span>{activity?.label || '散步中'}</span>
      <Tool icon={X} label="取消当前活动" onClick={onCancel} />
    </div>}
    {activity && <div className="activity-progress"><span style={{ width: `${activity.progress}%` }} /></div>}
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
        {tab === 'needs' && <div className="needs">{NEEDS.map(({ key, label, icon: Icon, color }) => <div className="need" key={key} style={{ '--need-color': color }}>
          <div><Icon size={12} /><span>{label}</span><strong>{Math.round(game.sim.needs[key])}</strong></div>
          <meter min={0} max={100} value={game.sim.needs[key]} aria-label={label} />
        </div>)}</div>}
        {tab === 'traits' && <div className="hud-traits">{game.avatar.traits.map(trait => <span key={trait}><Sparkles size={13} />{trait}</span>)}<button onClick={onEdit}><Pencil size={13} />编辑居民</button></div>}
        {tab === 'neighbors' && <div className="hud-neighbors">{neighbors.map(neighbor => <div key={neighbor.id}>
          <span className={`status-dot ${neighbor.busy ? 'busy' : ''}`} /><span>{neighbor.name}</span>
          <small>{neighbor.busy ? '交谈中' : '闲逛中'}</small><Tool icon={MessageCircle} label={`与${neighbor.name}聊天`} disabled={neighbor.busy} onClick={() => onChat(neighbor.id)} />
        </div>)}</div>}
      </div>
      <label className="autonomy-setting"><span>自主照料</span><input type="checkbox" role="switch" aria-label="自主照料" checked={game.sim.autonomy} onChange={event => onAutonomy(event.target.checked)} /></label>
      <nav className="resident-tabs" role="tablist" aria-label="居民信息" onKeyDown={onTabKey}>{TABS.map(({ id, label, icon: Icon }) => <button key={id} id={`resident-tab-${id}`} role="tab" aria-controls="resident-info-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} title={label} onClick={() => setTab(id)}><Icon size={15} strokeWidth={1.7} /><span>{label}</span></button>)}</nav>
    </>}
  </aside>;
}

export function TimeControls({ sim, speed, setSpeed }) {
  const clock = `${String(Math.floor(sim.time / 60)).padStart(2, '0')}:${String(Math.floor(sim.time % 60)).padStart(2, '0')}`;
  return <section className="time-controls surface" aria-label="时间与倍速">
    <div className="time-reading"><Sun size={14} /><strong>{clock}</strong><span>第 {sim.day} 天</span></div>
    <div className="time-playback">
      <Tool icon={speed ? Pause : Play} label={speed ? '暂停生活' : '继续生活'} aria-pressed={speed === 0} onClick={() => setSpeed(value => value ? 0 : 1)} />
      {[1, 2, 3].map(value => <button key={value} aria-label={`${value}倍速`} aria-pressed={speed === value} className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)}>{value}<small>×</small></button>)}
    </div>
  </section>;
}
