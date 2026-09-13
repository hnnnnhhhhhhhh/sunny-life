import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Armchair, ArrowDownToLine, ArrowUpFromLine, BedDouble,
  BrickWall, Check, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound,
  Coins, Copy, Download, Expand, Footprints, Glasses, Grid2X2, Hammer, Heart,
  Home, Leaf, Map as MapIcon, MapPin, Maximize2, MousePointer2, Move, PaintRoller,
  Palette, Pause, Play, Plus, Redo2, RotateCw, Save, Scissors,
  Search, Settings2, Shirt, Shuffle, Smile, Sofa, Sparkles, Sprout, Sun,
  Trash2, Undo2, Utensils, UtensilsCrossed, X, Zap, ZoomIn, ZoomOut,
  Bath, Camera, ChevronUp, DoorOpen, Scan, Square, RotateCcw, Toilet, ShowerHead, Box as BoxIcon, Fish, FishSymbol, Gauge, Droplets, Building2, ArrowLeftRight,
} from 'lucide-react';
import {
  ACTIVITIES, CATALOG, CLOTHES_COLORS, FLOOR_STYLES, HAIR_COLORS,
  ITEM_MAP, activityTypes, SKIN_COLORS, TRAITS, WALL_COLORS, loadGame, newGame, saveGame, uid,
  validatePlacement, validateResize, validateSave, validateWall, createRoom, bathroomAddition, migrateGame, advanceSim, GAME_MINUTES_PER_SECOND, newApartmentGame, switchResidence,
} from './game.js';
import { allWalls, floorRegions, removeWall, setWallOpening, wallParts } from './architecture.js';
import { avatarModel, furnitureModel, modelPreview } from './models.js';
import { World } from './world.js';
import { LANDMARKS, layout } from './terrain.js';
import { MEALS } from './interactions.js';
import { ResidentPanel, TimeControls } from './Hud.jsx';
import { FISH, FISHING_SPOTS } from './fishing.js';
import { isApartment } from './residence.js';

const formatMoney = n => new Intl.NumberFormat('en-US').format(n);

function onTabKey(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
  const index = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  event.preventDefault();
  buttons[next].focus();
  buttons[next].click();
}
const categories = [
  { id: 'all', label: '全部物品', icon: Grid2X2 },
  { id: 'living', label: '客厅', icon: Sofa },
  { id: 'bedroom', label: '卧室', icon: BedDouble },
  { id: 'kitchen', label: '厨房与餐厅', icon: UtensilsCrossed },
  { id: 'bathroom', label: '卫浴', icon: Bath },
  { id: 'outdoor', label: '花园', icon: Sprout },
];
const needs = [
  { key: 'hunger', label: '饱腹', icon: Utensils, color: '#bf9c61' },
  { key: 'energy', label: '精力', icon: Zap, color: '#86a184' },
  { key: 'social', label: '社交', icon: Heart, color: '#c38b7d' },
  { key: 'fun', label: '愉悦', icon: Smile, color: '#86a7af' },
  { key: 'hygiene', label: '清洁', icon: ShowerHead, color: '#86a7af' },
  { key: 'bladder', label: '如厕', icon: Toilet, color: '#9298b6' },
];
const hairOptions = [{ id: 'short', label: '短碎发' }, { id: 'bob', label: '齐肩发' }, { id: 'bun', label: '丸子头' }, { id: 'curly', label: '自然卷' }];

function reducer(state, action) {
  if (action.type === 'edit') {
    const next = action.update(state.game);
    if (next === state.game) return state;
    return { ...state, game: next, past: [...state.past.slice(-39), { home: state.game.home, budget: state.game.budget }], future: [] };
  }
  if (action.type === 'undo' && state.past.length) {
    const previous = state.past[state.past.length - 1];
    return { ...state, game: { ...state.game, ...previous }, past: state.past.slice(0, -1), future: [{ home: state.game.home, budget: state.game.budget }, ...state.future] };
  }
  if (action.type === 'redo' && state.future.length) {
    return { ...state, game: { ...state.game, ...state.future[0] }, past: [...state.past, { home: state.game.home, budget: state.game.budget }], future: state.future.slice(1) };
  }
  if (action.type === 'sim') return { ...state, game: { ...state.game, sim: { ...state.game.sim, ...action.value } } };
  if (action.type === 'needGain') {
    const sim=state.game.sim;
    return { ...state,game:{...state.game,sim:{...sim,needs:{...sim.needs,[action.need]:Math.min(100,sim.needs[action.need]+action.amount)}}} };
  }
  if (action.type === 'fishCaught') return { ...state,game:{...state.game,sim:{...state.game.sim,
    catches:[...state.game.sim.catches.slice(-199),{type:action.fish.id,day:state.game.sim.day}]}} };
  if (action.type === 'tick') {
    return { ...state, game: { ...state.game, sim: advanceSim(state.game.sim, GAME_MINUTES_PER_SECOND * action.speed) } };
  }
  if (action.type === 'avatar') return { ...state, game: { ...state.game, onboarding:true, avatar: action.value } };
  if (action.type === 'load') return { game: action.value, past: [], future: [], loadVersion: state.loadVersion + 1 };
  return state;
}

function IconButton({ icon: Icon, label, active, className = '', ...props }) {
  return <button type="button" className={`icon-button ${active ? 'is-active' : ''} ${className}`} aria-label={label} aria-pressed={active === undefined ? undefined : active} title={label} {...props}><Icon size={19} strokeWidth={1.7} /></button>;
}

function Swatches({ colors, value, onChange, label }) {
  return <div className="swatches" role="group" aria-label={label}>
    {colors.map((color, i) => <button key={color} type="button" className={`swatch ${value === color ? 'selected' : ''}`} style={{ '--swatch': color }} aria-label={`${label} ${i + 1}`} aria-pressed={value === color} title={`${label} ${i + 1}`} onClick={() => onChange(color)}>{value === color && <Check size={14} />}</button>)}
  </div>;
}

function Range({ label, value, onChange, min = 0.8, max = 1.2, step = 0.01, suffix = '' }) {
  return <label className="range-control"><span><span>{label}</span><output>{suffix ? `${value}${suffix}` : `${Math.round(value * 100)}%`}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}

const previewCache = new Map();
function FurniturePreview({ type, color, className = '' }) {
  const [source, setSource] = useState('');
  useEffect(() => {
    const key = `${type}:${color}`;
    try {
      if (!previewCache.has(key)) previewCache.set(key, modelPreview(furnitureModel(type, color)));
      setSource(previewCache.get(key));
    } catch { setSource(''); }
  }, [type, color]);
  return source ? <img className={`furniture-preview ${className}`} src={source} alt={ITEM_MAP[type].name} draggable="false" /> : <div className="preview-loading"><Armchair size={30} /></div>;
}

function AvatarPortrait({ avatar, className = '' }) {
  const [source, setSource] = useState('');
  useEffect(() => {
    try { setSource(modelPreview(avatarModel(avatar), true)); } catch { setSource(''); }
  }, [avatar]);
  return <div className={`avatar-portrait ${className}`}>{source ? <img src={source} alt={avatar.name} /> : <CircleUserRound size={32} />}</div>;
}

function Modal({ title, onClose, children, wide = false }) {
  const dialog = useRef(null);
  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => { if (el.open) el.close(); };
  }, []);
  return <dialog className={`modal ${wide ? 'wide' : ''}`} ref={dialog} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><IconButton icon={X} label="关闭" onClick={onClose} /></div>
    {children}
  </dialog>;
}

export default function App({ modelWarning = false }) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    let loaded;
    try { loaded = loadGame(window.localStorage); } catch { loaded = { data: newApartmentGame(false), recovered: true }; }
    return { game: loaded.data, past: [], future: [], loadVersion: 0, recovered: loaded.recovered };
  });
  const { game } = state;
  const apartment=isApartment(game.home);
  const [apartmentExterior,setApartmentExterior]=useState(false);
  const [mode, setMode] = useState(game.onboarding ? 'live' : 'avatar');
  const onboarding = game.onboarding === false;
  const [tool, setTool] = useState('select');
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState(null);
  const [wallStart, setWallStart] = useState(null);
  const [showGrid, setShowGrid] = useState(false);
  const [roof, setRoof] = useState(false);
  const [cutaway, setCutaway] = useState(true);
  const [perspective, setPerspective] = useState(false);
  const [lowQuality,setLowQuality]=useState(()=>new URLSearchParams(window.location.search).get('quality')==='low' || navigator.hardwareConcurrency<=4);
  const [speed, setSpeed] = useState(1);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState('home');
  const [avatarTab, setAvatarTab] = useState('face');
  const [draft, setDraft] = useState(onboarding ? {...game.avatar,name:''} : game.avatar);
  const [modal, setModal] = useState(null);
  const [saved, setSaved] = useState('saved');
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const [worldError, setWorldError] = useState('');
  const [activity, setActivity] = useState(null);
  const [queue, setQueue] = useState([]);
  const [walking, setWalking] = useState(false);
  const [interaction, setInteraction] = useState(null);
  const [selectedMeal, setSelectedMeal] = useState('pancakes');
  const [neighbors, setNeighbors] = useState([]);
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState(false);
  const worldNode = useRef(null), world = useRef(null), eventHandler = useRef(null);
  const latest = useRef(null), toastTimer = useRef(null), catalogue = useRef(null), fileInput = useRef(null);
  latest.current = { ...state, mode, tool, selected, pending, roof, cutaway, lowQuality, showGrid, speed, draft, wallStart, activity, apartmentExterior, propertiesOpen: mobilePanel, catalogOpen };
  const selectedObject = game.home.furniture.find(f => f.id === selected);
  const selectedInfo = selectedObject && ITEM_MAP[selectedObject.type];
  const filtered = useMemo(() => CATALOG.filter(item => (category === 'all' || item.category === category) && `${item.name}${item.detail}`.includes(search.trim())), [category, search]);

  const notify = useCallback(message => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }, []);

  function persist(manual = false) {
    if (latest.current.game.onboarding === false) return false;
    let success = false;
    try { success = saveGame(window.localStorage, latest.current.game); } catch { /* Storage may be disabled by the browser. */ }
    setSaved(success ? 'saved' : 'error');
    if (manual) notify(success ? '这个小世界，已经保存好了' : '浏览器存储不可用，请导出存档保留进度');
    return success;
  }

  useEffect(() => {
    if (state.recovered) notify('原存档无法读取，已为你打开新的小世界');
    else if (modelWarning) notify('部分精细模型未能加载，已使用基础模型，编辑与存档不受影响');
    let engine;
    try {
      engine = new World(worldNode.current, event => eventHandler.current?.(event));
      world.current = engine;
      engine.update(latest.current);
      setReady(true);
    } catch (error) {
      setWorldError(`3D 场景启动失败：${error.message}`);
    }
    return () => { engine?.dispose(); clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => { world.current?.update(latest.current); });
  useEffect(() => {
    if (onboarding) return;
    setSaved('saving');
    const timer = setTimeout(() => persist(), 750);
    return () => clearTimeout(timer);
  }, [game.home, game.avatar, game.budget, onboarding]);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = latest.current;
      if (current.mode === 'live' && current.speed > 0) dispatch({ type: 'tick', speed: current.speed });
    }, 1000);
    const backup = setInterval(() => persist(), 10000);
    const onHide = () => persist();
    window.addEventListener('pagehide', onHide);
    return () => { clearInterval(timer); clearInterval(backup); window.removeEventListener('pagehide', onHide); };
  }, []);
  const edit = update => dispatch({ type: 'edit', update });
  function updateHome(value) { edit(g => ({ ...g, home: { ...g.home, ...value } })); }
  function updateFurniture(id, values) {
    edit(g => ({ ...g, home: { ...g.home, furniture: g.home.furniture.map(f => f.id === id ? { ...f, ...values } : f) } }));
  }
  function cancelPlacement() { setPending(null); setWallStart(null); }
  function changeTool(next) {
    cancelPlacement(); setTool(next); setSelected(null);
    if (['wall', 'room', 'door', 'window', 'delete'].includes(next)) { setShowGrid(true); setRoof(false); setCatalogOpen(false); setMobilePanel(false); }
    if (next === 'paint') { setPanel('style'); setMobilePanel(true); }
  }
  function changeMode(next) {
    if (onboarding && next !== 'avatar') return;
    if (next === mode) return;
    cancelPlacement(); setSelected(null); setInteraction(null); setActivity(null); setWalking(false);
    if (next === 'avatar') setDraft(game.avatar);
    setMode(next); setTool('select'); setMobilePanel(false);
    if (next === 'build') { setRoof(false); setApartmentExterior(false); setCatalogOpen(true); }
  }
  function showApartment(exterior) {
    setApartmentExterior(exterior);setRoof(false);setInteraction(null);
    world.current?.command(exterior?'apartmentExterior':'home');
  }
  function moveHome() {
    world.current?.activities.cancel(true);
    const next=migrateGame(switchResidence(latest.current.game,apartment?'coastal':'apartment'));
    dispatch({type:'load',value:next});setDraft(next.avatar);
    cancelPlacement();setSelected(null);setInteraction(null);setActivity(null);
    setApartmentExterior(false);setRoof(false);setMode('live');setModal(null);setMobilePanel(false);
    notify(`已搬入${next.home.name}，原住宅已保留`);
  }
  function beginPlace(item) {
    if (game.budget < item.price) return notify('生活币不足，先收回一些闲置家具吧');
    setPending({ type: item.type, color: item.color, rotation: 0 });
    setSelected(null); setTool('select'); setRoof(false); setShowGrid(true); setMobilePanel(false);
  }
  function removeFurniture(id) {
    const item = latest.current.game.home.furniture.find(f => f.id === id);
    if (!item) return;
    edit(g => ({ ...g, budget: g.budget + ITEM_MAP[item.type].price, home: { ...g.home, furniture: g.home.furniture.filter(f => f.id !== id) } }));
    setSelected(null); cancelPlacement();
    notify(`已收回${ITEM_MAP[item.type].name} · +${formatMoney(ITEM_MAP[item.type].price)}`);
  }
  function moveFurniture(id) {
    const item = latest.current.game.home.furniture.find(f => f.id === id);
    if (!item) return;
    setPending({ ...item, movingId: id }); setSelected(id); setShowGrid(true); setRoof(false); setMobilePanel(false);
  }
  function rotate() {
    const current = latest.current;
    if (current.pending) setPending(p => ({ ...p, rotation: (p.rotation + Math.PI / 2) % (Math.PI * 2) }));
    else if (current.selected) {
      const object = current.game.home.furniture.find(f => f.id === current.selected);
      if (!object) return;
      const next = { ...object, rotation: (object.rotation + Math.PI / 2) % (Math.PI * 2) };
      const error = validatePlacement(current.game.home, next, object.id);
      if (error) notify(error);
      else updateFurniture(object.id, { rotation: next.rotation });
    }
  }
  function history(action) { cancelPlacement(); setSelected(null); dispatch({ type: action }); }
  function resizeHome(key, value) {
    const h = game.home;
    const next = validateResize(h, key === 'width' ? value : h.width, key === 'depth' ? value : h.depth);
    if (typeof next === 'string') notify(next);
    else updateHome(next);
  }

  function addBathroom() {
    const result = bathroomAddition(game.home);
    if (result.error) { notify(result.error); return; }
    if (game.budget < result.price) { notify('生活币不足'); return; }
    edit(g => ({ ...g, budget: g.budget - result.price, home: result.home }));
    setMobilePanel(false); notify('卫浴间已建好');
  }

  function clearLot() {
    const refund = game.home.furniture.reduce((sum, f) => sum + ITEM_MAP[f.type].price, 0) +
      game.home.walls.reduce((sum, w) => sum + (w.price || 0), 0) + (game.home.rooms || []).reduce((sum, r) => sum + (r.price || 0), 0);
    edit(g => ({ ...g, budget: Math.min(1000000, g.budget + refund), home: { ...g.home, foundation: isApartment(g.home), rooms: [], walls: [], furniture: [], removedExterior: [], exteriorEdits: {} } }));
    cancelPlacement(); setSelected(null); setModal(null); setMobilePanel(false); changeTool(apartment?'wall':'room');
    notify('地块已清空，家具与建材已收回');
  }

  eventHandler.current = event => {
    const current = latest.current;
    if (event.type === 'toast') notify(event.message);
    if (event.type === 'neighbors') setNeighbors(event.neighbors);
    if (event.type === 'queue') setQueue(event.queue);
    if (event.type === 'dismissInteraction') setInteraction(null);
    if (event.type === 'needGain') dispatch({ type:'needGain',need:event.need,amount:event.amount });
    if (event.type === 'fishCaught') {
      dispatch({ type:'fishCaught',fish:event.fish }); notify(`钓到了${event.fish.name}`);
    }
    if (event.type === 'projection') setPerspective(event.perspective);
    if (event.type === 'apartmentView') setApartmentExterior(event.exterior);
    if (event.type === 'select') { setSelected(event.id); if (event.id) setMobilePanel(true); }
    if (event.type === 'move') moveFurniture(event.id);
    if (event.type === 'remove') removeFurniture(event.id);
    if (event.type === 'wallStart') setWallStart({ x: event.x, z: event.z });
    if (event.type === 'wall') {
      const error = validateWall(current.game.home, event.wall);
      if (error) return notify(error);
      if (current.game.home.walls.length >= 160) return notify('当前地块最多建造 160 面墙体');
      const price = Math.round(Math.hypot(event.wall.x2 - event.wall.x1, event.wall.z2 - event.wall.z1) * 50);
      if (current.game.budget < price) return notify('生活币不足');
      edit(g => ({ ...g, budget: g.budget - price, home: { ...g.home, walls: [...g.home.walls, { ...event.wall, id: uid(), price }] } }));
      setWallStart(null); notify('新墙体已建好');
    }
    if (event.type === 'room') {
      const result = createRoom(current.game.home, { ...event.room, id: uid() });
      if (result.error) return notify(result.error);
      if (current.game.budget < result.price) return notify('生活币不足');
      edit(g => ({ ...g, budget: g.budget - result.price, home: result.home }));
      setWallStart(null); notify('房间与入口已建好');
    }
    if (event.type === 'opening') {
      const result = setWallOpening(current.game.home, event.id, event.kind, event.point);
      if (result.error) return notify(result.error);
      updateHome(result.home);
      notify(event.kind === 'door' ? '门洞已打通' : '窗户已装好');
    }
    if (event.type === 'removeWall') {
      const target = allWalls(current.game.home).find(w => w.id === event.id);
      if (!target) return;
      if(target.locked)return notify('公寓外墙与楼板不可拆除，套内隔墙可编辑');
      edit(g => ({ ...g, budget: g.budget + (target.price || 0), home: removeWall(g.home, event.id) }));
      notify('墙体已拆除');
    }
    if (event.type === 'removeFloor') {
      if(isApartment(current.game.home))return notify('公寓楼板与公共走廊不可拆除');
      if (event.id === 'foundation') {
        return notify('主屋地基请在房屋属性中清空建筑');
      } else {
        const room = current.game.home.rooms.find(r => r.id === event.id);
        if (!room) return;
        edit(g => ({ ...g, budget: g.budget + (room.price || 0), home: { ...g.home, rooms: g.home.rooms.filter(r => r.id !== room.id),
          walls: g.home.walls.map(w => w.roomId === room.id ? { ...w, roomId: undefined } : w) } }));
      }
      notify('地板已拆除');
    }
    if (event.type === 'place' && current.pending) {
      const p = current.pending;
      const object = { id: p.movingId || uid(), type: p.type, color: p.color, rotation: p.rotation, x: event.x, z: event.z };
      const error = validatePlacement(current.game.home, object, p.movingId);
      if (error) return notify(error);
      if (!p.movingId && current.game.budget < ITEM_MAP[p.type].price) return notify('生活币不足');
      edit(g => ({ ...g, budget: g.budget - (p.movingId ? 0 : ITEM_MAP[p.type].price), home: { ...g.home, furniture: p.movingId ? g.home.furniture.map(f => f.id === p.movingId ? object : f) : [...g.home.furniture, object] } }));
      setSelected(object.id); setPending(null); setMobilePanel(true);
      notify(p.movingId ? '家具已移动' : `${ITEM_MAP[p.type].name}，安放好了`);
    }
    if (event.type === 'position') dispatch({ type: 'sim', value: { x: event.x, z: event.z } });
    if (event.type === 'walking') { setWalking(true); setActivity(null); setInteraction(null); }
    if (event.type === 'arrived') {
      setWalking(false);
    }
    if (event.type === 'activity') {
      setActivity(event.activity);
      if (event.activity?.stage !== 'approach') setWalking(false);
    }
    if (event.type === 'activityComplete') {
      const definition = ACTIVITIES[event.activity];
      if (event.activity !== 'fish') notify(`${definition.label}已完成`);
    }
    if (event.type === 'clearActivity') { setActivity(null); setInteraction(null); }
    if (event.type === 'interact') {
      const object = current.game.home.furniture.find(f => f.id === event.id);
      if (object && ITEM_MAP[object.type].activity) setInteraction({ ...object, anchor: event.anchor });
      else notify('这件家具让家里更有生活气息了');
    }
  };

  useEffect(() => {
    const onKey = event => {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, dialog, [contenteditable]')) return;
      const current = latest.current;
      if (event.key === 'Escape') { cancelPlacement(); setSelected(null); setInteraction(null); setTool('select'); if (current.mode === 'live') world.current?.cancelActivity(); }
      if (current.mode === 'build' && event.key.toLowerCase() === 'r' && !(event.metaKey || event.ctrlKey)) { event.preventDefault(); rotate(); }
      if (current.mode === 'build' && ['Delete', 'Backspace'].includes(event.key) && current.selected) { event.preventDefault(); removeFurniture(current.selected); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && current.mode === 'build') { event.preventDefault(); history(event.shiftKey ? 'redo' : 'undo'); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); persist(true); }
      if (event.code === 'Space' && current.mode === 'live') { event.preventDefault(); setSpeed(s => s ? 0 : 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__sunny = {
      state: () => latest.current,
      diagnostics: options => world.current?.diagnostics(options),
      project: (x, y, z) => world.current?.project(x, y, z),
    };
    return () => { delete window.__sunny; };
  }, []);

  function applyAvatar() {
    if (!draft.name.trim()) { notify('请给新居民起一个名字'); return; }
    dispatch({ type: 'avatar', value: { ...draft, name: draft.name.trim() } });
    setMode('live'); setAvatarTab('face'); notify(`${draft.name.trim()}的新形象，完成了`);
  }
  function randomAvatar() {
    const pick = array => array[Math.floor(Math.random() * array.length)];
    setDraft(d => ({ ...d, skin: pick(SKIN_COLORS), hair: pick(hairOptions).id, hairColor: pick(HAIR_COLORS), top: pick(CLOTHES_COLORS), pants: pick(['#748a81', '#8c8272', '#657a89', '#a89279']), height: +(0.9 + Math.random() * 0.2).toFixed(2), build: +(0.87 + Math.random() * 0.27).toFixed(2), face: +(0.9 + Math.random() * 0.2).toFixed(2) }));
  }
  function visitPlace(place) {
    changeMode('live');
    setModal(null);
    setSpeed(value => value || 1);
    setTimeout(() => {
      world.current?.walkTo({ x: place.x, z: place.z });
      if (place.id === 'home'||apartment) world.current?.command('home');
      else world.current?.command('landmark', place);
    }, 80);
  }
  function exportSave() {
    const blob = new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `sunny-life-day-${game.sim.day}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('存档已导出');
  }
  async function importSave(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('存档文件过大');
      const data = JSON.parse(await file.text());
      if (!validateSave(data)) throw new Error('这不是有效的晴屿存档');
      const migrated=migrateGame(data);
      dispatch({ type: 'load', value:migrated }); setDraft(data.avatar); cancelPlacement();
      setSelected(null); setMode(migrated.onboarding ? 'build':'avatar'); setActivity(null); setInteraction(null); setModal(null); setRoof(false);
      notify('欢迎回家，存档已恢复');
    } catch (error) { notify(error.message === '存档文件过大' ? error.message : '存档无法读取，现有世界未受影响'); }
    event.target.value = '';
  }
  function downloadScreenshot() {
    const url = world.current?.screenshot();
    if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = 'sunny-life.png'; a.click(); notify('这一刻，已留在相册里');
  }
  const mood = Math.min(...Object.values(game.sim.needs)) < 25 ? '需要关心' : '惬意';
  const menuStyle = interaction?.anchor && window.innerWidth > 760 ? {
    left: Math.max(16, Math.min(window.innerWidth - 302, interaction.anchor.x + 12)),
    top: Math.max(78, Math.min(window.innerHeight - 235, interaction.anchor.y - 65)),
    bottom: 'auto', transform: 'none',
  } : undefined;

  return <main className={`game-shell compact-hud mode-${mode} ${apartment?'residence-apartment':''} ${catalogOpen ? '' : 'catalog-collapsed'}`}>
    <div ref={worldNode} className="world-viewport" />
    {!ready && <div className="world-loading"><Sun size={38} /><strong>{worldError || '青禾镇的阳光，准备好了'}</strong>{worldError && <button className="primary-button" onClick={() => window.location.reload()}>重新加载</button>}</div>}

    <header className="game-header">
      <div className="brand-block"><div className="brand-mark"><Home size={24} strokeWidth={1.6} /><span /></div><div><h1>晴屿<span>SUNNY LIFE</span></h1><p><MapPin size={11} /> 青禾镇 <span className="tiny-dot" /> 橡树巷 06</p></div></div>
      {onboarding ? <button className="text-button" onClick={()=>fileInput.current?.click()}><ArrowUpFromLine size={15}/>导入存档</button> :
        <div className="header-actions"><div className="wallet"><span className="coin"><Coins size={16} /></span><strong data-testid="budget">{formatMoney(game.budget)}</strong><span className="currency-label">生活币</span></div><span className="header-divider" /><IconButton icon={Save} label="存档管理" onClick={() => setModal('save')} /><button className="save-status" onClick={() => persist(true)}><span className={saved === 'error' ? 'error-dot' : 'status-dot'} />{saved === 'saving' ? '保存中' : saved === 'error' ? '未保存' : '已保存'}</button></div>}
    </header>
    {!onboarding && <nav className="mode-switch" aria-label="游戏模式">
      {[{ id: 'live', name: '生活', icon: Leaf }, { id: 'build', name: '建造', icon: Hammer }, { id: 'avatar', name: '角色', icon: CircleUserRound }].map(({ id, name, icon: Icon }) =>
        <button key={id} aria-label={name} title={name} aria-pressed={mode === id} className={mode === id ? 'active' : ''} onClick={() => changeMode(id)}><Icon size={17} strokeWidth={1.8} /><span>{name}</span></button>)}
    </nav>}

    {mode !== 'avatar' && <>
      <button className="location-label" aria-label={apartment?'浏览公寓户型':'浏览青禾镇'} title={apartment?'公寓户型':'青禾镇地图'} onClick={() => setModal('map')}><span className="location-dot" /><span>{apartment?game.home.name:mode === 'live' ? '青禾镇' : game.home.name}</span><span className="location-separator">/</span><span className="floor-label">{apartment?'3F':mode === 'live' ? '地图' : '1F'}</span><ChevronDown size={12} /></button>
      <div className="left-rail">
        {mode === 'build' ? <>
          <div className="tool-group">
            <IconButton icon={MousePointer2} label="选择家具" active={tool === 'select'} onClick={() => changeTool('select')} />
            <IconButton icon={Move} label="移动家具" active={tool === 'move'} onClick={() => changeTool('move')} />
            <IconButton icon={BrickWall} label="建造墙体" active={tool === 'wall'} onClick={() => changeTool('wall')} />
            {!apartment&&<IconButton icon={Square} label="建造房间" active={tool === 'room'} onClick={() => changeTool('room')} />}
            <IconButton icon={DoorOpen} label="安装门洞" active={tool === 'door'} onClick={() => changeTool('door')} />
            <IconButton icon={Grid2X2} label="安装窗户" active={tool === 'window'} onClick={() => changeTool('window')} />
            <IconButton icon={PaintRoller} label="墙面与地板" active={tool === 'paint'} onClick={() => changeTool('paint')} />
            <span className="tool-divider" />
            <IconButton icon={Trash2} label="拆除家具或墙体" active={tool === 'delete'} onClick={() => changeTool('delete')} />
          </div>
          <div className="tool-group"><IconButton icon={Undo2} label="撤销" disabled={!state.past.length} onClick={() => history('undo')} /><IconButton icon={Redo2} label="重做" disabled={!state.future.length} onClick={() => history('redo')} /></div>
        </> : <div className="tool-group"><IconButton icon={Home} label="回到家园视角" onClick={() => world.current?.command('home')} /><IconButton icon={MapIcon} label="青禾镇地图" onClick={() => setModal('map')} /><IconButton icon={Footprints} label="跟随居民" onClick={() => world.current?.command('follow')} /></div>}
      </div>

      <div className="camera-controls">
        <IconButton icon={ZoomOut} label="缩小视角" onClick={() => world.current?.command('zoomOut')} />
        <IconButton icon={ZoomIn} label="放大视角" onClick={() => world.current?.command('zoomIn')} />
        <span className="tool-divider" />
        <IconButton icon={RotateCcw} label="向左旋转视角" onClick={() => world.current?.command('rotateLeft')} />
        <IconButton icon={RotateCw} label="旋转视角" onClick={() => world.current?.command('rotate')} />
        <IconButton icon={Maximize2} label="回到家园视角" onClick={() => world.current?.command('home')} />
        <details className="camera-menu"><summary className="icon-button" aria-label="镜头设置" title="镜头设置"><Camera size={18} /></summary><div className="camera-options surface">
          <IconButton icon={ChevronUp} label="俯视更多" onClick={() => world.current?.command('tiltUp')} />
          <IconButton icon={ChevronDown} label="降低视角" onClick={() => world.current?.command('tiltDown')} />
          <IconButton icon={BoxIcon} label="透视镜头" active={perspective} onClick={() => world.current?.command('projection')} />
          <IconButton icon={Scan} label="自动剖墙" active={cutaway} onClick={() => setCutaway(v => !v)} />
          {!apartment&&<IconButton icon={Home} label={roof ? '隐藏屋顶' : '显示屋顶'} active={roof} onClick={() => setRoof(v => !v)} />}
          <IconButton icon={Grid2X2} label="显示建造网格" active={showGrid} onClick={() => setShowGrid(v => !v)} />
          <IconButton icon={MapIcon} label="青禾镇地图" onClick={() => setModal('map')} />
          <IconButton icon={Footprints} label="跟随居民" onClick={() => world.current?.command('follow')} />
          <IconButton icon={Gauge} label="轻量画质" active={lowQuality} onClick={()=>setLowQuality(value=>!value)} />
        </div></details>
      </div>
    </>}

    {mode === 'build' && <>
      <button className="mobile-properties icon-button" aria-label="房屋属性" onClick={() => setMobilePanel(v => !v)}><Settings2 size={20} /></button>
      <aside className={`inspector surface ${mobilePanel ? 'is-open' : ''}`} aria-label="房屋编辑">
        <div className="inspector-header"><span className="section-eyebrow">{selectedObject ? '物品详情' : '我的空间'}</span><IconButton icon={selectedObject ? X : Settings2} label={selectedObject ? '取消选择' : '切换材质设置'} onClick={() => { if (selectedObject) setSelected(null); else setPanel(p => p === 'home' ? 'style' : 'home'); }} /><IconButton className="mobile-close" icon={X} label="收起房屋属性" onClick={() => setMobilePanel(false)} /></div>
        {selectedObject ? <>
          <div className="selected-preview"><FurniturePreview type={selectedObject.type} color={selectedObject.color} /></div>
          <div className="item-detail-heading"><h2>{selectedInfo.name}</h2><p>{selectedInfo.detail}</p><span className="item-value"><Coins size={14} />{formatMoney(selectedInfo.price)}</span></div>
          <section className="inspector-section"><h3>配色</h3><Swatches colors={selectedInfo.colors} value={selectedObject.color} label="家具配色" onChange={color => updateFurniture(selectedObject.id, { color })} /></section>
          <section className="inspector-section"><h3>尺寸<span>占地面积</span></h3><div className="dimensions"><span>{selectedInfo.width.toFixed(1)} <small>m</small></span><X size={12} /><span>{selectedInfo.depth.toFixed(1)} <small>m</small></span></div></section>
          <div className="object-actions"><button onClick={() => moveFurniture(selected)}><Move size={16} />移动</button><button onClick={rotate}><RotateCw size={16} />旋转</button><button disabled={game.budget < selectedInfo.price} onClick={() => { beginPlace({ ...selectedInfo, color: selectedObject.color }); }}><Copy size={16} />复制</button><button className="danger" onClick={() => removeFurniture(selected)}><Trash2 size={16} />收回</button></div>
        </> : <>
          <div className="home-title"><div className="home-emblem"><Home size={26} strokeWidth={1.3} /><Leaf size={13} /></div><div><h2>{game.home.name}</h2><p>一处小家，许多种可能</p></div></div>
          <div className="house-numbers"><div><strong>{Math.round(floorRegions(game.home).filter(r=>r.id!=='corridor').reduce((area, r) => area + (r.x2 - r.x1) * (r.z2 - r.z1), 0)*10)/10}<small>m²</small></strong><span>{apartment?'套内与阳台':'房屋面积'}</span></div><span /><div><strong data-testid="furniture-count">{game.home.furniture.length}<small>件</small></strong><span>已放置物品</span></div></div>
          <div className="panel-tabs"><button className={panel === 'home' ? 'active' : ''} onClick={() => setPanel('home')}>空间设置</button><button className={panel === 'style' ? 'active' : ''} onClick={() => setPanel('style')}>材质与配色</button></div>
          {panel === 'home' ? <>
            {apartment?<section className="inspector-section"><h3>301 户型<Building2 size={14}/></h3><div className="dimensions"><span>12 <small>m</small></span><X size={12}/><span>9 <small>m</small></span></div></section>:
              <><section className="inspector-section"><h3>房屋尺寸<BrickWall size={14} /></h3><Range label="宽度" value={game.home.width} min={10} max={16} step={1} suffix=" m" onChange={v => resizeHome('width', v)} /><Range label="进深" value={game.home.depth} min={8} max={14} step={1} suffix=" m" onChange={v => resizeHome('depth', v)} /></section>
              <section className="inspector-section"><h3>墙体</h3><div className="segmented"><button className={!roof ? 'active' : ''} onClick={() => setRoof(false)}>剖面视图</button><button className={roof ? 'active' : ''} onClick={() => setRoof(true)}>完整房屋</button></div></section></>}
            <section className="inspector-section inline-setting"><span>对齐网格</span><button role="switch" aria-checked={showGrid} aria-label="对齐网格" className={`toggle ${showGrid ? 'on' : ''}`} onClick={() => setShowGrid(s => !s)}><span /></button></section>
            <section className="inspector-section lot-actions">{!apartment&&<button className="secondary-button" onClick={addBathroom}><Bath size={15} />添加卫浴间</button>}<button className="text-button danger" onClick={() => setModal('clear-lot')}><Trash2 size={14} />{apartment?'清空套内装修':'清空建筑与家具'}</button></section>
          </> : <>
            <section className="inspector-section"><h3>墙面颜色<span>哑光乳胶漆</span></h3><Swatches colors={WALL_COLORS} value={game.home.wallColor} label="墙面颜色" onChange={wallColor => updateHome({ wallColor })} /></section>
            <section className="inspector-section"><h3>地板材质</h3><div className="floor-options">{FLOOR_STYLES.map(floor => <button className={game.home.floor === floor.id ? 'selected' : ''} aria-pressed={game.home.floor === floor.id} key={floor.id} onClick={() => updateHome({ floor: floor.id })}><span className={`floor-sample ${floor.id}`} style={{ '--floor': floor.color }}>{game.home.floor === floor.id && <Check size={14} />}</span><span>{floor.name}</span></button>)}</div></section>
          </>}
          <div className="home-footer"><Sprout size={15} /><span>自在生长的家</span><span className="small-label">HOME NO. 006</span></div>
        </>}
      </aside>
      {(pending || ['wall', 'room', 'door', 'window', 'delete'].includes(tool)) && <div className="placement-bar surface"><span className="status-dot" /><span>{pending ? `正在放置 · ${ITEM_MAP[pending.type].name}` : { wall: wallStart ? '墙体终点' : '新建墙体', room: wallStart ? '房间对角' : '新建房间', door: '门洞', window: '窗户', delete: '拆除' }[tool]}</span>{pending && <IconButton icon={RotateCw} label="旋转待放置家具" onClick={rotate} />}<IconButton icon={X} label="取消放置" onClick={() => { cancelPlacement(); setTool('select'); }} /></div>}
      <section className={`catalog surface ${catalogOpen ? '' : 'closed'}`} aria-label="家具目录">
        <div className="catalog-header"><div className="catalog-heading"><Armchair size={19} strokeWidth={1.6} /><h2>好物目录</h2><span>{CATALOG.length}</span></div><nav className="catalog-categories" aria-label="家具分类">{categories.map(({ id, label, icon: Icon }) => <button key={id} className={category === id ? 'active' : ''} aria-pressed={category === id} onClick={() => { setCategory(id); catalogue.current?.scrollTo({ left: 0 }); }}><Icon size={15} /><span>{label}</span></button>)}</nav><label className="catalog-search"><Search size={15} /><input aria-label="搜索家具" placeholder="发现喜欢的好物" value={search} onChange={e => setSearch(e.target.value)} />{search && <button aria-label="清空搜索" onClick={() => setSearch('')}><X size={13} /></button>}</label><IconButton icon={ChevronDown} className={catalogOpen ? '' : 'flipped'} label={catalogOpen ? '收起家具目录' : '展开家具目录'} onClick={() => setCatalogOpen(v => !v)} /></div>
        <div className="catalog-body"><div className="catalog-items" ref={catalogue}>{filtered.map(item => <button key={item.type} className={`catalog-item ${pending?.type === item.type ? 'selected' : ''}`} onClick={() => beginPlace(item)} aria-label={`放置${item.name}`} disabled={game.budget < item.price}><FurniturePreview type={item.type} color={item.color} /><span className="item-add"><Plus size={13} /></span><div className="catalog-item-info"><strong>{item.name}</strong><span><Coins size={11} />{formatMoney(item.price)}</span></div></button>)}{!filtered.length && <div className="catalog-empty"><Search size={20} /><span>没有找到这件好物</span><button onClick={() => { setSearch(''); setCategory('all'); }}>清空筛选</button></div>}</div><div className="catalog-scroll-buttons"><IconButton icon={ChevronLeft} label="上一组家具" onClick={() => catalogue.current?.scrollBy({ left: -450, behavior: 'smooth' })} /><IconButton icon={ChevronRight} label="下一组家具" onClick={() => catalogue.current?.scrollBy({ left: 450, behavior: 'smooth' })} /></div></div>
      </section>
    </>}

    {mode === 'live' && <>
      {!apartment&&<button className="fishing-entry surface" aria-label="钓鱼与鱼获" onClick={()=>setModal('fishing')}><Fish size={17}/><span>钓鱼</span>{game.sim.catches.length>0 && <small>{game.sim.catches.length}</small>}</button>}
      <div className={`residence-tools surface ${apartment?'':'coastal'}`}>
        {apartment?<><button aria-label="室内剖面" title="室内剖面" aria-pressed={!apartmentExterior} onClick={()=>showApartment(false)}><Sofa size={16}/><span>室内</span></button><button aria-label="整栋公寓" title="整栋公寓" aria-pressed={apartmentExterior} onClick={()=>showApartment(true)}><Building2 size={16}/><span>整栋</span></button><IconButton icon={ArrowLeftRight} label="切换住宅" onClick={()=>setModal('residence')}/></>:
          <button onClick={()=>setModal('residence')}><Building2 size={16}/><span>搬入公寓</span></button>}
      </div>
      <ResidentPanel game={game} activity={activity} walking={walking} Portrait={AvatarPortrait} onEdit={() => changeMode('avatar')} onCancel={() => world.current?.cancelActivity()} neighbors={neighbors} onChat={id => world.current?.startChat(id)} onTabKey={onTabKey} onAutonomy={value => dispatch({ type: 'sim', value: { autonomy: value } })}
        onOnlineChat={()=>world.current?.startOnlineChat()} onPlaceComputer={()=>{changeMode('build');setCategory('bedroom');beginPlace(ITEM_MAP.desk);}}
        queue={queue} onRemoveQueue={id=>world.current?.queue.remove(id)} onClearQueue={()=>world.current?.queue.clear()} onMoveQueue={id=>world.current?.queue.moveUp(id)} />
      <TimeControls sim={game.sim} speed={speed} setSpeed={setSpeed} />
      {interaction && (ITEM_MAP[interaction.type].activity === 'eat' ? <div className="interaction-menu meal-menu surface" style={menuStyle}>
        <div className="meal-menu-heading"><UtensilsCrossed size={17} /><span>{ITEM_MAP[interaction.type].name}</span><IconButton icon={X} label="关闭家具互动" onClick={() => setInteraction(null)} /></div>
        <div className="segmented" aria-label="餐点选择">{Object.entries(MEALS).map(([id, meal]) => <button key={id} aria-pressed={selectedMeal === id} className={selectedMeal === id ? 'active' : ''} onClick={() => setSelectedMeal(id)}>{meal.name}</button>)}</div>
        <button className="primary-button" onClick={() => world.current?.startActivity(interaction.id, selectedMeal)}><Play size={14} />开始用餐<span>饱腹 +{MEALS[selectedMeal].amount}</span></button>
        {activityTypes(interaction.type).includes('washHands') && <button className="secondary-button" onClick={() => world.current?.startActivity(interaction.id, undefined, 'washHands')}><Droplets size={15} />洗手</button>}
      </div> : <div className="interaction-menu surface" style={menuStyle}><span>{ITEM_MAP[interaction.type].name}</span><button className="primary-button" onClick={() => world.current?.startActivity(interaction.id)}><Play size={14} />{ACTIVITIES[ITEM_MAP[interaction.type].activity].label}</button><IconButton icon={X} label="关闭家具互动" onClick={() => setInteraction(null)} /></div>)}
    </>}

    {mode === 'avatar' && <>
      <div className="studio-label"><span className="section-eyebrow">{onboarding?'青禾镇 · 新居民':'青禾镇 · 居民档案'}</span><h2>{draft.name || '新居民'}</h2><span className="resident-id">RESIDENT / 001</span></div>
      <div className="studio-tools tool-group"><IconButton icon={CircleUserRound} label="面部特写" onClick={() => world.current?.command('portrait')} /><IconButton icon={Maximize2} label="全身视角" onClick={() => world.current?.command('fullBody')} /><IconButton icon={RotateCw} label="旋转角色视角" onClick={() => world.current?.command('rotate')} /><span className="tool-divider" /><IconButton icon={Shuffle} label="随机形象" onClick={randomAvatar} /></div>
      <div className="studio-caption"><div>{draft.traits.map(t => <span key={t}><Sparkles size={11} />{t}</span>)}</div></div>
      <aside className="avatar-editor surface" aria-label="角色编辑">
        <div className="avatar-heading"><div><span className="section-eyebrow">创造你的居民</span><h2>这就是我</h2></div><IconButton icon={Shuffle} label="随机生成角色" onClick={randomAvatar} /></div>
        <div className="avatar-tabs" role="tablist" aria-label="角色选项" onKeyDown={onTabKey}>
          {[{ id: 'face', label: '形象', icon: CircleUserRound }, { id: 'hair', label: '发型', icon: Scissors }, { id: 'outfit', label: '穿搭', icon: Shirt }, { id: 'traits', label: '性格', icon: Sparkles }].map(({ id, label, icon: Icon }) => <button key={id} id={`avatar-tab-${id}`} role="tab" aria-controls="avatar-fields" tabIndex={avatarTab === id ? 0 : -1} aria-selected={avatarTab === id} className={avatarTab === id ? 'active' : ''} onClick={() => setAvatarTab(id)}><Icon size={19} strokeWidth={1.6} /><span>{label}</span></button>)}
        </div>
        <div className="avatar-fields" id="avatar-fields" role="tabpanel" aria-labelledby={`avatar-tab-${avatarTab}`}>
          {avatarTab === 'face' && <>
            <label className="name-field"><span>居民姓名</span><input aria-label="居民姓名" maxLength={16} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></label>
            <section className="inspector-section"><h3>基础面容</h3><div className="segmented">{[['female', '柔和轮廓'], ['male', '硬朗轮廓']].map(([value, label]) => <button key={value} aria-pressed={(draft.base || 'female') === value} className={(draft.base || 'female') === value ? 'active' : ''} onClick={() => setDraft(previous => ({ ...previous, base: value }))}>{label}</button>)}</div></section>
            <section className="inspector-section"><h3>肤色</h3><Swatches colors={SKIN_COLORS} value={draft.skin} label="肤色" onChange={skin => setDraft(d => ({ ...d, skin }))} /></section>
            <section className="inspector-section"><h3>面部轮廓</h3><div className="segmented">{[{ label: '柔和', value: 1.13 }, { label: '自然', value: 1 }, { label: '清秀', value: 0.87 }].map(p => <button key={p.label} aria-pressed={draft.face === p.value} className={draft.face === p.value ? 'active' : ''} onClick={() => setDraft(d => ({ ...d, face: p.value }))}>{p.label}</button>)}</div><Range label="脸部宽度" value={draft.face} min={0.8} max={1.2} onChange={face => setDraft(d => ({ ...d, face }))} /><Range label="眼睛大小" value={draft.eyes} onChange={eyes => setDraft(d => ({ ...d, eyes }))} /><Range label="鼻部轮廓" value={draft.nose} onChange={nose => setDraft(d => ({ ...d, nose }))} /></section>
            <section className="inspector-section"><h3>体型</h3><Range label="身高" value={draft.height} min={0.85} max={1.15} onChange={height => setDraft(d => ({ ...d, height }))} /><Range label="肩部宽度" value={draft.build} min={0.8} max={1.3} onChange={build => setDraft(d => ({ ...d, build }))} /></section>
          </>}
          {avatarTab === 'hair' && <>
            <section className="inspector-section"><h3>发型<span>{hairOptions.find(h => h.id === draft.hair).label}</span></h3><div className="hair-options">{hairOptions.map(h => <button key={h.id} aria-label={h.label} className={draft.hair === h.id ? 'selected' : ''} aria-pressed={draft.hair === h.id} onClick={() => setDraft(d => ({ ...d, hair: h.id }))}><HairPreview avatar={draft} hair={h.id} /><span>{h.label}</span>{draft.hair === h.id && <Check size={13} />}</button>)}</div></section>
            <section className="inspector-section"><h3>发色</h3><Swatches colors={HAIR_COLORS} value={draft.hairColor} label="发色" onChange={hairColor => setDraft(d => ({ ...d, hairColor }))} /></section>
          </>}
          {avatarTab === 'outfit' && <>
            <section className="inspector-section"><h3>日常穿搭</h3><div className="segmented">{[['shirt','休闲衬衫'],['jacket','轻便夹克'],['cardigan','针织开衫']].map(([value,label]) => <button key={value} aria-pressed={(draft.outfit || 'jacket') === value} className={(draft.outfit || 'jacket') === value ? 'active' : ''} onClick={() => setDraft(d => ({ ...d, outfit: value }))}>{label}</button>)}</div></section>
            <section className="inspector-section"><h3>上装配色</h3><Swatches colors={CLOTHES_COLORS} value={draft.top} label="上衣颜色" onChange={top => setDraft(d => ({ ...d, top }))} /></section>
            <section className="inspector-section"><h3>下装<span>棉质直筒裤</span></h3><Swatches colors={['#748a81', '#8c8272', '#657a89', '#a89279', '#d6c8ae', '#514f4b']} value={draft.pants} label="裤子颜色" onChange={pants => setDraft(d => ({ ...d, pants }))} /></section>
            <section className="inspector-section"><h3>鞋履<span>轻便帆布鞋</span></h3><Swatches colors={['#faf5e8', '#8b7160', '#798d84', '#b77f70', '#555b57']} value={draft.shoes} label="鞋子颜色" onChange={shoes => setDraft(d => ({ ...d, shoes }))} /></section>
            <section className="inspector-section inline-setting"><span><Glasses size={16} />圆框眼镜</span><button className={`toggle ${draft.glasses ? 'on' : ''}`} role="switch" aria-label="圆框眼镜" aria-checked={draft.glasses} onClick={() => setDraft(d => ({ ...d, glasses: !d.glasses }))}><span /></button></section>
          </>}
          {avatarTab === 'traits' && <section className="inspector-section"><h3>性格特质<span>{draft.traits.length} / 3</span></h3><div className="trait-options">{TRAITS.map((trait, i) => {
            const Icon = [Leaf, Palette, Heart, Home, Zap, Sun][i];
            return <button key={trait} className={draft.traits.includes(trait) ? 'selected' : ''} aria-pressed={draft.traits.includes(trait)} onClick={() => setDraft(d => ({ ...d, traits: d.traits.includes(trait) ? d.traits.filter(t => t !== trait) : d.traits.length < 3 ? [...d.traits, trait] : d.traits }))}><Icon size={23} strokeWidth={1.5} /><span>{trait}</span>{draft.traits.includes(trait) && <Check size={12} />}</button>;
          })}</div></section>}
        </div>
        <div className="avatar-footer">{!onboarding && <button className="secondary-button" onClick={() => { setDraft(game.avatar); changeMode('build'); }}>取消</button>}<button className="primary-button" onClick={applyAvatar}><Check size={16} />{onboarding?'开始生活':'完成形象'}</button></div>
      </aside>
    </>}

    <div className="world-meta"><span className="meta-mark">s.</span><span>属于你的日常</span><span className="meta-line" /><span>EARLY ACCESS 0.1</span></div>
    {toast && !modal && <div role="status" aria-label="游戏通知" className="toast"><span className="toast-check"><Check size={13} /></span>{toast}</div>}
    <input type="file" ref={fileInput} accept=".json,application/json" className="file-input" aria-label="导入晴屿存档" onChange={importSave} />

    {modal === 'save' && <Modal title="留住这个小世界" onClose={() => setModal(null)}>
      <div className="save-summary"><AvatarPortrait avatar={game.avatar} /><div><strong>{game.avatar.name}的{game.home.name}</strong><span>第 {game.sim.day} 天 · {game.home.furniture.length} 件家具 · {game.home.width * game.home.depth} m²</span></div><span className="status-dot" /></div>
      <div className="save-options"><button onClick={() => persist(true)}><Save size={20} /><span><strong>保存到浏览器</strong><small>{saved === 'saved' ? '当前进度已保存' : '保存当前进度'}</small></span><ChevronRight size={17} /></button><button onClick={exportSave}><ArrowDownToLine size={20} /><span><strong>导出存档</strong><small>Sunny Life · JSON</small></span><ChevronRight size={17} /></button><button onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={20} /><span><strong>导入存档</strong><small>恢复已有的家园与居民</small></span><ChevronRight size={17} /></button><button onClick={downloadScreenshot}><Download size={20} /><span><strong>拍张纪念照</strong><small>当前场景 · PNG</small></span><ChevronRight size={17} /></button></div>
      <div className="modal-bottom"><a className="text-button" href={`${import.meta.env.BASE_URL}models/supplied/LICENSE.txt`} target="_blank" rel="noreferrer">素材鸣谢</a><button className="text-button" onClick={() => setModal('reset')}>重新开始</button></div>
      {toast && <div className="modal-notice" role="status" aria-label="游戏通知">{toast}</div>}
    </Modal>}
    {modal === 'reset' && <Modal title="开启新的小日子？" onClose={() => setModal('save')}><p className="reset-warning">当前的房屋和居民会被替换。建议先导出存档，保留这个小世界。</p><div className="reset-actions"><button className="secondary-button" onClick={() => setModal('save')}>返回</button><button className="secondary-button" onClick={exportSave}>导出当前存档</button><button className="primary-button" onClick={() => { const next = newApartmentGame(false); dispatch({ type: 'load', value: next }); setDraft({...next.avatar,name:''}); cancelPlacement(); setSelected(null); setActivity(null); setInteraction(null); setMode('avatar'); setModal(null); notify('新的日常，从这里开始'); }}>重新开始</button></div></Modal>}
    {modal==='residence'&&<Modal title={apartment?'返回海岸住宅？':'搬入青禾公寓？'} onClose={()=>setModal(null)}>
      <p className="reset-warning">当前住宅的装修与余额会单独保留，可随时切回。居民、需求、游戏时间和鱼获保持不变。</p>
      <div className="reset-actions"><button className="secondary-button" onClick={()=>setModal(null)}>取消</button><button className="primary-button" onClick={moveHome}><Building2 size={16}/>{apartment?'返回海岸住宅':'确认搬入公寓'}</button></div>
    </Modal>}
    {modal === 'clear-lot' && <Modal title={apartment?'清空套内装修？':'清空建筑与家具？'} onClose={() => setModal(null)}><p className="reset-warning">{apartment?'收回家具并拆除套内隔墙，保留外墙、楼板和阳台。':'拆除所有墙体、地板并收回家具。'}居民和需求不会重置，此操作可以撤销。</p><div className="reset-actions"><button className="secondary-button" onClick={() => setModal(null)}>取消</button><button className="primary-button" onClick={clearLot}>{apartment?'确认清空套内':'确认清空地块'}</button></div></Modal>}
    {modal === 'fishing' && <Modal title="钓鱼与鱼获" onClose={()=>setModal(null)}>
      <div className="fishing-spots">{FISHING_SPOTS.map(spot=><button key={spot.id} onClick={()=>{world.current?.startFishing(spot.id);setModal(null);}}><Fish size={20}/><span>{spot.name}</span><ChevronRight size={16}/></button>)}</div>
      <div className="catch-collection"><h3>鱼获 <span>{game.sim.catches.length}</span></h3>{FISH.map(fish=><div key={fish.id}><FishSymbol size={23} style={{color:fish.color}}/><span>{fish.name}</span><strong>{game.sim.catches.filter(c=>c.type===fish.id).length}</strong></div>)}</div>
    </Modal>}
    {modal === 'map' && <Modal title={apartment?'青禾公寓 · 301':'青禾镇'} wide onClose={() => setModal(null)}>
      <div className="town-map"><MiniMap x={game.sim.x} z={game.sim.z} home={game.home} /></div>
      <nav className="landmark-list" aria-label="小镇目的地">{(apartment?[
        {id:'home',name:'公寓客厅',subtitle:'301 · 套内',x:0,z:0},
        {id:'balcony',name:'阳台',subtitle:'南向 · 绿植与晾晒',x:0,z:5.5},
        {id:'corridor',name:'公共走廊',subtitle:'邻里 · 入户门',x:7.25,z:-1.5},
      ]:LANDMARKS).map(place => <button key={place.id} aria-label={`前往${place.name}`} onClick={() => visitPlace(place)}>
        {place.id === 'home' ? <Home size={18} /> : <MapPin size={18} />}<strong>{place.name}</strong><ChevronRight size={14} /><span>{place.subtitle}</span>
      </button>)}</nav>
      <div className="map-legend"><span><i className="map-you" />{game.avatar.name}</span><span><i className="map-home" />住宅区</span><button className="secondary-button" onClick={() => { setModal(null); if(apartment)showApartment(true);else world.current?.command('map'); }}>{apartment?'整栋外观':'街区全景'}<Expand size={14} /></button></div>
    </Modal>}
  </main>;
}

function HairPreview({ avatar, hair }) {
  const variant = useMemo(() => ({ ...avatar, hair }), [avatar.skin, avatar.hairColor, hair]);
  return <AvatarPortrait avatar={variant} />;
}

function MiniMap({ small = false, x, z, home }) {
  if(isApartment(home))return <svg className="full-map" viewBox="-7 -5.5 16.5 12.7" role="img" aria-label="公寓套内与公共走廊平面图">
    <rect x="-7" y="-5.5" width="16.5" height="12.7" fill="#dce5df"/>
    {floorRegions(home).map(r=><rect key={r.id} x={r.x1} y={r.z1} width={r.x2-r.x1} height={r.z2-r.z1} fill={r.id==='foundation'?'#efe8d9':'#bfd0c8'}/>)}
    {home.furniture.filter(f=>!ITEM_MAP[f.type].flat).map(f=><rect key={f.id} x={f.x-ITEM_MAP[f.type].width/2} y={f.z-ITEM_MAP[f.type].depth/2}
      width={ITEM_MAP[f.type].width} height={ITEM_MAP[f.type].depth} transform={`rotate(${-f.rotation*180/Math.PI} ${f.x} ${f.z})`} fill={f.color} stroke="#81958b" strokeWidth=".04"/>)}
    {allWalls(home).flatMap(w=>wallParts(w,true).map((p,i)=><rect key={`${w.id}-${i}`} x={p.x-p.width/2} y={p.z-p.depth/2} width={p.width} height={p.depth} fill="#687f76"/>))}
    <text x="7.2" y="-3.6" fontSize=".45" textAnchor="middle" fill="#416356">走廊</text>
    <text x="0" y="6" fontSize=".45" textAnchor="middle" fill="#416356">阳台</text>
    <circle cx={x} cy={z} r=".19" fill="#477d65" stroke="#fff" strokeWidth=".06"/>
  </svg>;
  return <svg className={small ? 'mini-map' : 'full-map'} viewBox="-40 -32 80 67" role="img" aria-label="青禾镇街区地图">
    <rect x="-40" y="-32" width="80" height="67" fill="#8eb7b9" />
    {layout.lands.map(land => <polygon key={land.id} points={land.polygon.map(p => p.join(',')).join(' ')} fill={land.color} stroke="#718b60" strokeWidth=".35" />)}
    {layout.terraces.map(land => <polygon key={land.id} points={land.polygon.map(p => p.join(',')).join(' ')} fill="#afba88" stroke="#7b9166" strokeWidth=".35" />)}
    {layout.ramps.map(ramp => <rect key={ramp.id} x={ramp.x - ramp.width / 2} y={ramp.z - ramp.depth / 2} width={ramp.width} height={ramp.depth} fill="#d0c49d" />)}
    {layout.bridges.map(bridge => <g key={bridge.id} transform={`translate(${bridge.x} ${bridge.z}) rotate(${-bridge.rotation * 180 / Math.PI})`}><rect x={-bridge.width / 2} y={-bridge.depth / 2} width={bridge.width} height={bridge.depth} fill="#c7a875" stroke="#9b855e" strokeWidth=".25" />{[-3, -2, -1, 0, 1, 2, 3].map(p => <path key={p} d={`M-1.3 ${p}H1.3`} stroke="#a69069" strokeWidth=".14" />)}</g>)}
    {layout.buildings.map(building => building.type === 'tower' ? <circle key={building.id} cx={building.x} cy={building.z} r="2.1" fill="#78748b" stroke="#ddd0a9" strokeWidth=".5" /> : <rect key={building.id} x={building.x - building.width / 2} y={building.z - building.depth / 2} width={building.width} height={building.depth} rx=".2" fill={building.color || '#b59e7c'} stroke="#ebdebb" strokeWidth=".3" />)}
    {floorRegions(home).map(room => <rect key={room.id} x={room.x1} y={room.z1} width={room.x2 - room.x1} height={room.z2 - room.z1} fill="#eee4c8" />)}
    {allWalls(home).flatMap(wall => wallParts(wall, true).map((part, i) => <rect key={`${wall.id}-${i}`} x={part.x - part.width / 2} y={part.z - part.depth / 2} width={part.width} height={part.depth} fill="#9a927b" />))}
    {layout.trees.map(([tx, tz, scale, type], i) => type === 'pine' ? <path key={i} d={`M${tx} ${tz - 1.4 * scale}l${-scale} ${2.2 * scale}h${2 * scale}z`} fill="#5b814e" /> : <circle key={i} cx={tx} cy={tz} r={1.1 * scale} fill="#789b59" />)}
    {!small && LANDMARKS.map(place => <text key={place.id} x={place.x} y={place.z + 2.5} textAnchor="middle" fontSize="1.9" fontWeight="500" fill="#3c574d" stroke="#e2e7cc" strokeWidth=".5" paintOrder="stroke">{place.name}</text>)}
    <circle cx={x} cy={z} r="1" fill="#4b8c70" stroke="#fff9e6" strokeWidth=".45" />
  </svg>;
}
