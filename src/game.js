import PF from 'pathfinding';
import { WORLD_COLLIDERS, restoreWorldPosition, terrainHeight, terrainSurface, terrainWalkable } from './terrain.js';
import { allWalls, EXTERIOR_IDS, exteriorRecords, floorRegions, onFloor, PLOT, roomWalls, setWallOpening, sharedWall, wallAxis, wallColliders, wallParts } from './architecture.js';
import { APARTMENT_COLLIDERS, apartmentPlaceable, apartmentWalkable, isApartment } from './residence.js';

export const SAVE_KEY = 'sunny-life.save.v1';
export const CATALOG = [
  { type: 'sofa', name: '云朵三人沙发', category: 'living', price: 1280, width: 3, depth: 1.15, color: '#829b79', colors: ['#829b79', '#e1b08e', '#779ea7', '#ece2cc'], detail: '棉麻织物 · 白蜡木', activity: 'rest' },
  { type: 'chair', name: '拥抱休闲椅', category: 'living', price: 640, width: 1.15, depth: 1.05, color: '#d3987c', colors: ['#d3987c', '#bdc397', '#799b9a', '#ece2cc'], detail: '弧形靠背 · 柔软坐垫', activity: 'rest' },
  { type: 'coffee', name: '鹅卵石茶几', category: 'living', price: 360, width: 1.55, depth: 0.85, color: '#be9266', colors: ['#be9266', '#795b43', '#eee5d5'], detail: '实木桌面 · 自然纹理' },
  { type: 'shelf', name: '日光格子书架', category: 'living', price: 820, width: 1.45, depth: 0.5, color: '#c39c71', colors: ['#c39c71', '#f0e7d6', '#726250'], detail: '开放式收纳 · 六格设计', activity: 'read' },
  { type: 'plant', name: '一盆龟背竹', category: 'outdoor', price: 180, width: 0.7, depth: 0.7, color: '#e4d6bb', colors: ['#e4d6bb', '#c07f61', '#8e9d8c'], detail: '陶土花盆 · 常绿植物', activity: 'garden' },
  { type: 'lamp', name: '午后落地灯', category: 'living', price: 290, width: 0.65, depth: 0.65, color: '#eee1c4', colors: ['#eee1c4', '#d59a79', '#a7b59a'], detail: '柔光灯罩 · 黄铜支架' },
  { type: 'rug', name: '软绒几何地毯', category: 'living', price: 420, width: 3.8, depth: 3.2, color: '#eee4cd', colors: ['#eee4cd', '#b3c3ba', '#d4a595'], detail: '羊毛混纺 · 低饱和织色', flat: true },
  { type: 'tv', name: '周末影音柜', category: 'living', price: 1660, width: 2.1, depth: 0.55, color: '#bc956b', colors: ['#bc956b', '#78614d', '#e4dfd3'], detail: '原木矮柜 · 轻薄屏幕', activity: 'watch' },
  { type: 'bed', name: '好梦双人床', category: 'bedroom', price: 1850, width: 2.25, depth: 2.9, color: '#b1b998', colors: ['#b1b998', '#c8a49b', '#a3b6c2', '#e3cfb2'], detail: '棉质床品 · 软包床头', activity: 'sleep' },
  { type: 'nightstand', name: '床边小方柜', category: 'bedroom', price: 260, width: 0.65, depth: 0.6, color: '#c09970', colors: ['#c09970', '#eee4d2', '#7c6b58'], detail: '双层收纳 · 实木拉手' },
  { type: 'desk', name: '日常电脑桌', category: 'bedroom', price: 780, width: 1.8, depth: 1.5, color: '#c6aa82', colors: ['#c6aa82', '#e8e1d2', '#96745b'], detail: '台式电脑 · 键盘 · 配套座椅', activity: 'onlineChat', activities:['onlineChat','read'] },
  { type: 'kitchen', name: '晨光整体厨房', category: 'kitchen', price: 2400, width: 3.9, depth: 0.95, color: '#a9b8aa', colors: ['#a9b8aa', '#d6cab1', '#8ca4aa'], detail: '石材台面 · 烤箱 · 微波炉', activity: 'eat', activities:['eat','washHands'] },
  { type: 'dining', name: '两个人的餐桌', category: 'kitchen', price: 960, width: 1.9, depth: 1.9, color: '#cca476', colors: ['#cca476', '#e3d7bf', '#906d53'], detail: '圆角餐桌 · 一桌两椅', activity: 'eat' },
  { type: 'fridge', name: '双门冷藏冰箱', category: 'kitchen', price: 1200, width: 0.9, depth: 0.85, color: '#d4dfcf', colors: ['#d4dfcf', '#e4c0a5', '#99b9c2'], detail: '金属门板 · 双门冷藏', activity: 'eat' },
  { type: 'bench', name: '花园长椅', category: 'outdoor', price: 380, width: 1.9, depth: 0.7, color: '#be9971', colors: ['#be9971', '#e0daca', '#7c998e'], detail: '户外实木 · 铸铁椅脚', activity: 'rest' },
  { type: 'planter', name: '小小花圃', category: 'outdoor', price: 240, width: 1.4, depth: 0.7, color: '#b48261', colors: ['#b48261', '#e6d5b4', '#7d9386'], detail: '木质花箱 · 四季花卉', activity: 'garden' },
  { type: 'toilet', name: '净白坐便器', category: 'bathroom', price: 520, width: 0.8, depth: 1.15, color: '#edf1ed', colors: ['#edf1ed', '#b2cac6', '#c9c5d5'], detail: '陶瓷坐便 · 节水水箱', activity: 'toilet' },
  { type: 'shower', name: '晨雾淋浴间', category: 'bathroom', price: 980, width: 1.4, depth: 1.4, color: '#b2cac6', colors: ['#b2cac6', '#edf1ed', '#c9c5d5'], detail: '磨砂围挡 · 顶置花洒', activity: 'shower' },
  { type: 'sink', name: '清泉洗手台', category: 'bathroom', price: 460, width: 1.1, depth: 0.8, color: '#bfd0c8', colors:['#bfd0c8','#edf1ed','#b0bccb'], detail:'陶瓷水盆 · 感应排水', activity:'washHands' },
];

export const ITEM_MAP = Object.fromEntries(CATALOG.map(item => [item.type, item]));
export const activityTypes = type => ITEM_MAP[type]?.activities || (ITEM_MAP[type]?.activity ? [ITEM_MAP[type].activity] : []);
export const FLOOR_STYLES = [
  { id: 'oak', name: '浅橡木', color: '#c9ab80' },
  { id: 'birch', name: '白桦木', color: '#e1d4b5' },
  { id: 'walnut', name: '胡桃木', color: '#8e7057' },
  { id: 'tile', name: '棋盘石砖', color: '#b1beb4' },
];
export const WALL_COLORS = ['#f3f1e8', '#bdcbb6', '#b3c9cc', '#dfb9a7', '#d6cfba'];
export const SKIN_COLORS = ['#f3d6bf', '#e5b896', '#ca9571', '#a66f4e', '#754c38'];
export const HAIR_COLORS = ['#40352e', '#75523a', '#ba8c52', '#c5ac84', '#974f43', '#c3c5c2'];
export const CLOTHES_COLORS = ['#f0e3ce', '#739486', '#ce8b78', '#81a7b8', '#c5b77d', '#5d6674'];
export const TRAITS = ['热爱自然', '创意满满', '社交达人', '居家派', '活力十足', '慢生活'];
export const ACTIVITIES = {
  rest: { label: '坐下休息', status: '放空一小会儿', need: 'energy', amount: 20 },
  sleep: { label: '睡个好觉', status: '正在做一个好梦', need: 'energy', amount: 38 },
  eat: { label: '吃点东西', status: '享用一份简餐', need: 'hunger', amount: 32 },
  read: { label: '读一本书', status: '沉浸在好故事里', need: 'fun', amount: 25 },
  watch: { label: '看一会儿电影', status: '电影时光', need: 'fun', amount: 26 },
  garden: { label: '照顾植物', status: '照料心爱的小植物', need: 'fun', amount: 22 },
  chat: { label: '打个招呼', status: '和邻居聊聊天', need: 'social', amount: 30 },
  onlineChat: { label:'网上聊天', status:'和好友网上聊天', need:'social', amount:30 },
  toilet: { label: '上厕所', status: '正在如厕', need: 'bladder', amount: 72 },
  shower: { label: '洗澡', status: '正在淋浴', need: 'hygiene', amount: 65 },
  fish: { label: '钓鱼', status: '静待鱼儿上钩', need: 'fun', amount: 24 },
  washHands: { label:'洗手', status:'正在洗手', need:'hygiene', amount:3 },
};

export const NEED_DEFAULTS = { hunger: 78, energy: 86, social: 68, fun: 92, hygiene: 82, bladder: 85 };
export const GAME_MINUTES_PER_SECOND = 0.5;
export const NEED_DECAY = Object.freeze({
  hunger: 50 / (5 * 60), energy: 60 / (16 * 60),
  social: 35 / (24 * 60), fun: 40 / (12 * 60),
  hygiene: 30 / (24 * 60), bladder: 65 / (8 * 60),
});

export function advanceSim(sim, minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return sim;
  const time = sim.time + minutes;
  const needs = Object.fromEntries(Object.entries(sim.needs).map(([key,value]) =>
    [key, Math.max(0, value - (NEED_DECAY[key] || 0) * minutes)]));
  return { ...sim, time: time % 1440, day: Math.min(99999, sim.day + Math.floor(time / 1440)), needs };
}

export const DEFAULT_AVATAR = {
  name: '林小满', skin: SKIN_COLORS[1], hairColor: HAIR_COLORS[0], hair: 'bob',
  top: CLOTHES_COLORS[0], pants: '#748a81', shoes: '#faf5e8',
  height: 1, build: 1, face: 1, eyes: 1, nose: 1, glasses: false,
  outfit: 'jacket',
  base: 'female',
  traits: ['热爱自然', '慢生活'],
};

function item(id, type, x, z, rotation = 0) {
  return { id, type, x, z, rotation, color: ITEM_MAP[type].color };
}

export function newGame(onboarding = true) {
  const game = {
    version: 1,
    onboarding,
    home: {
      name: '橡树小屋', width: 12, depth: 9, floor: 'oak', wallColor: WALL_COLORS[0],
      foundation: true, rooms: [], removedExterior: [], exteriorEdits: {},
      walls: [{ id: 'partition', x1: 1.2, z1: -4.5, x2: 1.2, z2: -1.8 }],
      furniture: [
        item('rug-1', 'rug', -3.1, 0.35),
        item('sofa-1', 'sofa', -3.1, -2.75),
        item('coffee-1', 'coffee', -3.1, 0.1),
        item('chair-1', 'chair', -0.75, 0.55, -Math.PI / 2),
        item('shelf-1', 'shelf', -5.55, -0.2, Math.PI / 2),
        item('lamp-1', 'lamp', -5.25, -3),
        item('plant-1', 'plant', -5.2, 3.4),
        item('tv-1', 'tv', -2.95, 3.85, Math.PI),
        item('bed-1', 'bed', 3.35, 2.4),
        item('nightstand-1', 'nightstand', 5.12, 1.3),
        item('kitchen-1', 'kitchen', 3.3, -3.85),
        item('dining-1', 'dining', 3.2, -1.4),
        item('bench-1', 'bench', 8.25, 1.6, -Math.PI / 2),
        item('planter-1', 'planter', 8.3, -1.5),
      ],
    },
    avatar: structuredClone(DEFAULT_AVATAR),
    budget: 28650,
    sim: { x: -0.45, z: 2.55, time: 624, day: 1, autonomy: true, catches: [], needs: { ...NEED_DEFAULTS } },
  };
  const bathroom = bathroomAddition(game.home);
  if (!bathroom.error) game.home = bathroom.home;
  return game;
}

export function newApartmentGame(onboarding = true) {
  const game=newGame(onboarding);
  game.home={
    name:'青禾公寓 · 301',residence:'apartment',width:12,depth:9,floor:'oak',wallColor:'#f3f1e8',
    foundation:true,rooms:[],removedExterior:[],exteriorEdits:{},
    walls:[
      {id:'bathroom-east',x1:-2.5,z1:-4.5,x2:-2.5,z2:-1,kind:'door',opening:-1.9},
      {id:'bathroom-south',x1:-6,z1:-1,x2:-2.5,z2:-1},
      {id:'bedroom-divider',x1:1.5,z1:1,x2:1.5,z2:4.5},
    ],
    furniture:[
      item('sofa-1','sofa',-3.4,.1),item('tv-1','tv',-3.35,3.85,Math.PI),
      item('rug-1','rug',-3.4,2),item('coffee-1','coffee',-3.4,2.9),
      item('lamp-1','lamp',-5.45,.1),item('shelf-1','shelf',-.85,-3.85),
      item('bed-1','bed',3.9,2.5),item('nightstand-1','nightstand',2.05,3.85),
      item('kitchen-1','kitchen',3.3,-3.85),item('dining-1','dining',3.2,-1.4),
      item('fridge-1','fridge',.55,-3.9),
      item('shower-1','shower',-5.05,-3.5),item('toilet-1','toilet',-3.3,-3.6),
      item('sink-1','sink',-5.42,-1.9,Math.PI/2),
      item('desk-1','desk',0,2),
      item('plant-1','plant',-5.3,5.5),item('planter-1','planter',3.7,5.65),
    ],
  };
  const colors={sofa:'#5d8376',bed:'#c19796',kitchen:'#b5c5c1',tv:'#889fa3',rug:'#c6cebd'};
  game.home.furniture=game.home.furniture.map(f=>({...f,color:colors[f.type]||f.color}));
  game.sim={...game.sim,x:0,z:0};
  return game;
}

export function switchResidence(game,residence) {
  if(!['apartment','coastal'].includes(residence))return game;
  if((isApartment(game.home)?'apartment':'coastal')===residence)return game;
  const backup=game.residenceBackup;
  const saved=backup&&(isApartment(backup.home)?'apartment':'coastal')===residence?backup:null;
  const fresh=residence==='apartment'?newApartmentGame():newGame();
  return {...game,home:saved?.home||fresh.home,budget:saved?.budget??fresh.budget,
    sim:{...game.sim,x:saved?.x??fresh.sim.x,z:saved?.z??fresh.sim.z},
    residenceBackup:{home:game.home,budget:game.budget,x:game.sim.x,z:game.sim.z}};
}

export const worldColliders = home => isApartment(home)?APARTMENT_COLLIDERS:WORLD_COLLIDERS;

export function footprint(object) {
  const info = ITEM_MAP[object.type];
  const c = Math.abs(Math.cos(object.rotation || 0));
  const s = Math.abs(Math.sin(object.rotation || 0));
  return { width: info.width * c + info.depth * s, depth: info.depth * c + info.width * s };
}

export function rectanglesOverlap(a, b, padding = 0.04) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + padding &&
    Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + padding;
}

export function wallBounds(wall) {
  return {
    x: (wall.x1 + wall.x2) / 2, z: (wall.z1 + wall.z2) / 2,
    width: Math.abs(wall.x2 - wall.x1) || 0.16, depth: Math.abs(wall.z2 - wall.z1) || 0.16,
  };
}

export function outerWalls(home) {
  return exteriorRecords(home).flatMap(wall => wallParts(wall, true));
}

export function validatePlacement(home, object, ignoreId) {
  const info = ITEM_MAP[object.type];
  if (!info || !Number.isFinite(object.x) || !Number.isFinite(object.z)) return '无效的家具';
  const rect = { ...footprint(object), x: object.x, z: object.z };
  if(isApartment(home)&&!apartmentPlaceable(rect))return '家具只能摆在套内或自家阳台，不能占用公共走廊';
  if (Math.abs(rect.x) + rect.width / 2 > 10.5 || Math.abs(rect.z) + rect.depth / 2 > 8.5) return '超出了自家地块';
  if (home.furniture.length >= 120 && !ignoreId) return '当前地块最多放置 120 件家具';
  if (home.furniture.some(other => {
    if (other.id === ignoreId || (ITEM_MAP[other.type].flat !== info.flat && (info.flat || ITEM_MAP[other.type].flat))) return false;
    return rectanglesOverlap(rect, { ...footprint(other), x: other.x, z: other.z });
  })) return '这里已经有家具了';
  if (!info.flat && wallColliders(home).some(w => rectanglesOverlap(rect, w))) return '家具不能穿过墙壁';
  if (!info.flat && worldColliders(home).some(block => rectanglesOverlap(rect, block))) return '这里有固定建筑或围栏';
  return null;
}

export function validateWall(home, wall) {
  const values = [wall.x1, wall.x2, wall.z1, wall.z2];
  if (!values.every(Number.isFinite)) return '无效的墙体';
  if (wall.x1 !== wall.x2 && wall.z1 !== wall.z2) return '墙体需要沿网格放置';
  if (Math.hypot(wall.x1 - wall.x2, wall.z1 - wall.z2) < 0.5) return '墙体至少需要一格长度';
  if(isApartment(home)&&values.some((v,i)=>Math.abs(v)>(i<2?6:4.5)))return '隔墙只能建在公寓套内';
  if (Math.max(Math.abs(wall.x1), Math.abs(wall.x2)) > PLOT.x ||
      Math.max(Math.abs(wall.z1), Math.abs(wall.z2)) > PLOT.z) return '请在自家地块内建墙';
  const rect = wallBounds(wall);
  if (home.furniture.some(f => !ITEM_MAP[f.type].flat && rectanglesOverlap(rect, { ...footprint(f), x: f.x, z: f.z }))) return '这里的家具挡住了墙体';
  if (worldColliders(home).some(block => rectanglesOverlap(rect, block))) return '这里有固定建筑或围栏';
  const axis = wallAxis(wall);
  if (allWalls(home).some(w => {
    const other = wallAxis(w);
    return axis.horizontal === other.horizontal && Math.abs(axis.fixed - other.fixed) < 0.16 &&
      Math.min(axis.end, other.end) - Math.max(axis.start, other.start) > 0.01;
  })) return '这里已经有墙体了';
  return null;
}

export function createRoom(home, room) {
  if(isApartment(home))return {error:'公寓可调整套内隔墙，不能向楼外扩建'};
  if (![room.x1, room.x2, room.z1, room.z2].every(Number.isFinite)) return { error: '无效的房间' };
  const width = room.x2 - room.x1, depth = room.z2 - room.z1;
  if (width < 2 || depth < 2) return { error: '房间至少需要 2 × 2 米' };
  if (Math.max(Math.abs(room.x1), Math.abs(room.x2)) > PLOT.x || Math.max(Math.abs(room.z1), Math.abs(room.z2)) > PLOT.z) return { error: '房间超出了自家地块' };
  if ((home.rooms || []).length >= 20) return { error: '当前地块最多建造 20 个房间' };
  if (floorRegions(home).some(r => Math.min(room.x2, r.x2) - Math.max(room.x1, r.x1) > 0.01 &&
    Math.min(room.z2, r.z2) - Math.max(room.z1, r.z1) > 0.01)) return { error: '房间不能覆盖已有地板' };
  const walls = roomWalls(room).filter(wall => !allWalls(home).some(existing => sharedWall(wall, existing)));
  if (!walls.some(wall => wall.kind === 'door') && walls.length) walls[0] = { ...walls[0], kind: 'door' };
  for (const wall of walls) {
    const error = validateWall(home, wall);
    if (error) return { error };
  }
  if (home.walls.length + walls.length > 160) return { error: '当前地块墙体数量已达上限' };
  const floorPrice = Math.round(width * depth * 12);
  const pricedWalls = walls.map(w => ({ ...w, price: Math.round(Math.hypot(w.x2 - w.x1, w.z2 - w.z1) * 50) }));
  return { home: { ...home, rooms: [...(home.rooms || []), { ...room, price: floorPrice }], walls: [...home.walls, ...pricedWalls] },
    price: floorPrice + pricedWalls.reduce((total, w) => total + w.price, 0) };
}

export function bathroomAddition(home) {
  if(isApartment(home))return {error:'公寓已有卫浴区，可从目录调整卫浴设施'};
  if ((home.rooms || []).some(r => r.id === 'bathroom')) return { error: '已经有卫浴间了' };
  const result = createRoom(home, { id: 'bathroom', x1: -10, z1: -2, x2: -6, z2: 2 });
  if (result.error) return result;
  let next = result.home;
  if (home.foundation !== false && home.width === 12) {
    next = setWallOpening(next, 'exterior-west', 'door', { x: -6, z: 1.1 }).home || next;
  }
  const fixtures = [item('shower-1', 'shower', -9.05, -0.95), item('toilet-1', 'toilet', -7.1, -1.15)];
  for (const fixture of fixtures) {
    if (next.furniture.some(f => f.id === fixture.id)) return { error: '请从卫浴目录手动放置设施' };
    const error = validatePlacement(next, fixture);
    if (error) return { error };
    next = { ...next, furniture: [...next.furniture, fixture] };
  }
  return { home: next, price: result.price + ITEM_MAP.toilet.price + ITEM_MAP.shower.price };
}

export function validateResize(home, width, depth) {
  if(isApartment(home))return '公寓外轮廓固定，可装修内部隔墙与家具';
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width < 10 || width > 16 || depth < 8 || depth > 14) return '房屋尺寸超出地块范围';
  const next = { ...home, width, depth };
  const wasInside = f => Math.abs(f.x) < home.width / 2 && Math.abs(f.z) < home.depth / 2;
  for (const f of home.furniture.filter(wasInside)) {
    const size = footprint(f);
    if (Math.abs(f.x) + size.width / 2 > width / 2 - 0.12 || Math.abs(f.z) + size.depth / 2 > depth / 2 - 0.12) return '请先移开房屋边缘的家具';
  }
  if (home.walls.filter(w => !w.roomId).some(w => Math.max(Math.abs(w.x1), Math.abs(w.x2)) > width / 2 || Math.max(Math.abs(w.z1), Math.abs(w.z2)) > depth / 2)) return '请先移除边缘的自定义墙体';
  if ((home.rooms || []).some(r => Math.min(width / 2, r.x2) - Math.max(-width / 2, r.x1) > 0.01 &&
    Math.min(depth / 2, r.z2) - Math.max(-depth / 2, r.z1) > 0.01)) return '新尺寸会覆盖扩建房间';
  if (home.furniture.some(f => !ITEM_MAP[f.type].flat && outerWalls(next).some(w => rectanglesOverlap({ ...footprint(f), x: f.x, z: f.z }, w)))) return '请先移开新墙体附近的家具';
  return next;
}

const finiteBetween = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const validOpening = w => (w.kind === undefined || ['wall', 'door', 'window'].includes(w.kind)) &&
  (w.opening === undefined || finiteBetween(w.opening, -11, 11)) &&
  w.openings === undefined;
function openingFits(wall) {
  if (!['door', 'window'].includes(wall.kind)) return true;
  const axis = wallAxis(wall), half = wall.kind === 'door' ? 0.75 : 0.7;
  const position = wall.opening ?? (axis.start + axis.end) / 2;
  return axis.end - axis.start >= half * 2 + 0.3 && position - half >= axis.start && position + half <= axis.end;
}
const validRoom = r => r && typeof r.id === 'string' && [r.x1, r.x2].every(n => finiteBetween(n, -PLOT.x, PLOT.x)) &&
  [r.z1, r.z2].every(n => finiteBetween(n, -PLOT.z, PLOT.z)) && r.x2 - r.x1 >= 2 && r.z2 - r.z1 >= 2 &&
  (r.price === undefined || finiteBetween(r.price, 0, 10000));
export function validateSave(data) {
  if (!data || data.version !== 1 || !data.home || !data.avatar || !data.sim) return false;
  const { home, avatar, sim } = data;
  return typeof home.name === 'string' && home.name.length <= 40 &&
    (home.residence===undefined||['coastal','apartment'].includes(home.residence)) &&
    (!isApartment(home)||(home.width===12&&home.depth===9&&home.foundation!==false&&
      !home.rooms?.length&&!home.removedExterior?.length&&!Object.keys(home.exteriorEdits||{}).length)) &&
    (data.residenceBackup===undefined||(data.residenceBackup&&
      isApartment(data.residenceBackup.home)!==isApartment(home)&&
      validateSave({...data,residenceBackup:undefined,home:data.residenceBackup.home,budget:data.residenceBackup.budget,
        sim:{...sim,x:data.residenceBackup.x,z:data.residenceBackup.z}}))) &&
    (data.onboarding === undefined || typeof data.onboarding === 'boolean') &&
    finiteBetween(home.width, 10, 16) && finiteBetween(home.depth, 8, 14) &&
    FLOOR_STYLES.some(f => f.id === home.floor) && isColor(home.wallColor) &&
    (home.foundation === undefined || typeof home.foundation === 'boolean') &&
    (home.rooms === undefined || (Array.isArray(home.rooms) && home.rooms.length <= 20 && home.rooms.every(validRoom) && new Set(home.rooms.map(r => r.id)).size === home.rooms.length)) &&
    (home.removedExterior === undefined || (Array.isArray(home.removedExterior) && home.removedExterior.every(id => EXTERIOR_IDS.includes(id)))) &&
    (home.exteriorEdits === undefined || (home.exteriorEdits && typeof home.exteriorEdits === 'object' && !Array.isArray(home.exteriorEdits) &&
      Object.entries(home.exteriorEdits).every(([id, value]) => EXTERIOR_IDS.includes(id) && value && validOpening(value)) &&
      exteriorRecords(home).every(openingFits))) &&
    Array.isArray(home.furniture) && home.furniture.length <= 120 &&
    home.furniture.every(f => f && typeof f.id === 'string' && Object.hasOwn(ITEM_MAP, f.type) &&
      finiteBetween(f.x, -11, 11) && finiteBetween(f.z, -9, 9) &&
      finiteBetween(f.rotation, -1000, 1000) && isColor(f.color) &&
      (!isApartment(home)||apartmentPlaceable({...f,...footprint(f)}))) &&
    new Set(home.furniture.map(f => f.id)).size === home.furniture.length &&
    Array.isArray(home.walls) && home.walls.length <= 160 &&
    home.walls.every(w => w && typeof w.id === 'string' && !EXTERIOR_IDS.includes(w.id) && [w.x1, w.x2].every(n => finiteBetween(n, -PLOT.x, PLOT.x)) &&
      [w.z1, w.z2].every(n => finiteBetween(n, -PLOT.z, PLOT.z)) && (w.x1 === w.x2 || w.z1 === w.z2) &&
      Math.hypot(w.x2 - w.x1, w.z2 - w.z1) >= 0.5 && validOpening(w) && openingFits(w) &&
      (!isApartment(home)||Math.max(Math.abs(w.x1),Math.abs(w.x2))<=6&&Math.max(Math.abs(w.z1),Math.abs(w.z2))<=4.5) &&
      (w.roomId === undefined || home.rooms?.some(r => r.id === w.roomId)) &&
      (w.price === undefined || finiteBetween(w.price, 0, 2000))) &&
    new Set(home.walls.map(w => w.id)).size === home.walls.length &&
    typeof avatar.name === 'string' && avatar.name.trim().length > 0 && avatar.name.length <= 16 &&
    ['short', 'bob', 'bun', 'curly'].includes(avatar.hair) &&
    ['skin', 'hairColor', 'top', 'pants', 'shoes'].every(k => isColor(avatar[k])) &&
    ['height', 'build', 'face', 'eyes', 'nose'].every(k => finiteBetween(avatar[k], 0.7, 1.4)) &&
    typeof avatar.glasses === 'boolean' && Array.isArray(avatar.traits) && avatar.traits.length <= 3 &&
    (avatar.outfit === undefined || ['shirt', 'jacket', 'cardigan'].includes(avatar.outfit)) &&
    (avatar.base === undefined || ['female', 'male'].includes(avatar.base)) &&
    avatar.traits.every(t => TRAITS.includes(t)) && finiteBetween(data.budget, 0, 1000000) &&
    finiteBetween(sim.x, -38, 38) && finiteBetween(sim.z, -38, 38) &&
    finiteBetween(sim.time, 0, 1440) && finiteBetween(sim.day, 1, 99999) &&
    (sim.autonomy === undefined || typeof sim.autonomy === 'boolean') &&
    (sim.catches === undefined || (Array.isArray(sim.catches) && sim.catches.length <= 200 &&
      sim.catches.every(c => c && ['silver','perch','golden'].includes(c.type) && finiteBetween(c.day,1,99999)))) &&
    sim.needs && ['hunger', 'energy', 'social', 'fun'].every(n => finiteBetween(sim.needs[n], 0, 100)) &&
    ['hygiene', 'bladder'].every(n => sim.needs[n] === undefined || finiteBetween(sim.needs[n], 0, 100));
}

export function migrateGame(data) {
  const next={
    ...data,
    onboarding: data.onboarding ?? true,
    home: { ...data.home, foundation: data.home.foundation ?? true, rooms: data.home.rooms || [],
      removedExterior: data.home.removedExterior || [], exteriorEdits: data.home.exteriorEdits || {} },
    sim: { ...data.sim, autonomy: data.sim.autonomy ?? true, catches:data.sim.catches || [], needs: { ...NEED_DEFAULTS, ...data.sim.needs } },
  };
  return isApartment(next.home)?apartmentWalkable(next.sim.x,next.sim.z)?next:
    {...next,sim:{...next.sim,x:0,z:0}}:restoreWorldPosition(next);
}

export function loadGame(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return { data: newApartmentGame(false), recovered: false };
    const data = JSON.parse(raw);
    return validateSave(data) ? { data: migrateGame(data), recovered: false } : { data: newApartmentGame(false), recovered: true };
  } catch {
    return { data: newApartmentGame(false), recovered: true };
  }
}

export function saveGame(storage, game) {
  if (!validateSave(game)) return false;
  try { storage.setItem(SAVE_KEY, JSON.stringify(game)); return true; } catch { return false; }
}

export const WORLD_BLOCKS = [
  { x: -18, z: -17, width: 8, depth: 7 },
  { x: 2, z: -20, width: 9, depth: 7 },
  { x: 20, z: -15, width: 8, depth: 8 },
  { x: -22, z: 2, width: 9, depth: 7 },
  { x: 21, z: 14, width: 8, depth: 7 },
  { x: -14, z: 24, width: 8, depth: 7 },
  { x: 8, z: 26, width: 9, depth: 7 },
  { x: 23, z: -1, width: 7, depth: 5 },
];

const NAV_SIZE = 153, NAV_HALF = 38, NAV_STEP = 0.5;
const indexOf = n => Math.max(0, Math.min(NAV_SIZE - 1, Math.round((n + NAV_HALF) / NAV_STEP)));
const worldOf = n => n * NAV_STEP - NAV_HALF;
let terrainTemplate;

export function navigationGrid(home) {
  if (!terrainTemplate) {
    terrainTemplate = new PF.Grid(NAV_SIZE, NAV_SIZE);
    for (let z = 0; z < NAV_SIZE; z++) for (let x = 0; x < NAV_SIZE; x++) {
      terrainTemplate.setWalkableAt(x, z, terrainWalkable(worldOf(x), worldOf(z)));
    }
  }
  const grid = isApartment(home)?new PF.Grid(NAV_SIZE,NAV_SIZE):terrainTemplate.clone();
  if(isApartment(home))for(let z=0;z<NAV_SIZE;z++)for(let x=0;x<NAV_SIZE;x++)
    grid.setWalkableAt(x,z,apartmentWalkable(worldOf(x),worldOf(z),.17));
  const blocks = [
    ...wallColliders(home), ...worldColliders(home),
    ...home.furniture.filter(f => !ITEM_MAP[f.type].flat).map(f => ({ ...footprint(f), x: f.x, z: f.z })),
  ];
  for (const b of blocks) {
    const low=n=>isApartment(home)?Math.ceil((n+NAV_HALF)/NAV_STEP):indexOf(n);
    const high=n=>isApartment(home)?Math.floor((n+NAV_HALF)/NAV_STEP):indexOf(n);
    const x0 = low(b.x - b.width / 2 - 0.17), x1 = high(b.x + b.width / 2 + 0.17);
    const z0 = low(b.z - b.depth / 2 - 0.17), z1 = high(b.z + b.depth / 2 + 0.17);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid.setWalkableAt(x, z, false);
  }
  return grid;
}

function nearestFree(grid, x, z, radius = 6) {
  const ix = indexOf(x), iz = indexOf(z);
  if (grid.isWalkableAt(ix, iz)) return [ix, iz];
  for (let r = 1; r <= radius; r++) {
    const candidates = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
      const nx = ix + dx, nz = iz + dz;
      if (grid.isInside(nx, nz) && grid.isWalkableAt(nx, nz)) candidates.push([nx, nz]);
    }
    if (candidates.length) return candidates.sort((a, b) => Math.hypot(a[0] - ix, a[1] - iz) - Math.hypot(b[0] - ix, b[1] - iz))[0];
  }
  return null;
}

export function findPath(home, from, to, cachedGrid) {
  if (Math.abs(to.x) > 38 || Math.abs(to.z) > 38 ||
    (isApartment(home)?!apartmentWalkable(to.x,to.z):terrainSurface(to.x,to.z).kind==='water')) return [];
  const grid = cachedGrid || navigationGrid(home);
  const start = nearestFree(grid, from.x, from.z);
  if (!start) return [];
  const tx = indexOf(to.x), tz = indexOf(to.z), candidates = [];
  if (grid.isWalkableAt(tx, tz)) candidates.push([tx, tz]);
  else {
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
      const x = tx + dx, z = tz + dz;
      if (grid.isInside(x, z) && grid.isWalkableAt(x, z)) candidates.push([x, z]);
    }
    candidates.sort((a, b) => Math.hypot(a[0] - tx, a[1] - tz) - Math.hypot(b[0] - tx, b[1] - tz));
  }
  // A furniture's nearest free tile can be enclosed by walls or another object.
  // Try reachable approach points in distance order instead of accepting that tile.
  const finder = new PF.AStarFinder({ allowDiagonal: true, dontCrossCorners: true });
  for (const end of candidates.slice(0, 64)) {
    const path = finder.findPath(...start, ...end, grid.clone());
    if (path.length) return PF.Util.compressPath(path).map(([x, z]) => ({ x: worldOf(x), z: worldOf(z) }));
  }
  return [];
}

export function surfaceHeight(home, x, z) {
  if(isApartment(home))return .25;
  return onFloor(home, x, z) ? 0.25 : terrainHeight(x, z) + 0.04;
}

export const snap = n => Math.round(n * 2) / 2;
export const uid = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
