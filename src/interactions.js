import { findPath, footprint, ITEM_MAP, activityTypes, rectanglesOverlap, surfaceHeight, worldColliders } from './game.js';
import { wallColliders } from './architecture.js';
import { apartmentWalkable, isApartment } from './residence.js';
import residentLayout from './resident-layout.json' with { type:'json' };
import { SINK_LAYOUT, sinkCenter } from './handwashing.js';
import { bedSeatAngle } from './bed-motion.js';

export const MEALS = {
  pancakes: { name: '枫糖松饼', duration: 12, amount: 32 },
  salad: { name: '田园沙拉', duration: 10, amount: 26 },
};
export const STAGE_LABELS = { approach: '前往座位', seating: '正在入座', active: '享用餐点', standing: '用餐结束', cancelling: '结束当前活动' };

export function localPoint(object, x, z) {
  const c = Math.cos(object.rotation), s = Math.sin(object.rotation);
  return { x: object.x + x * c + z * s, z: object.z - x * s + z * c };
}

function clearCorridor(home, from, to, ignored) {
  const obstacles = [
    ...wallColliders(home), ...worldColliders(home),
    ...home.furniture.filter(f => f.id !== ignored && !ITEM_MAP[f.type].flat).map(f => ({ ...f, ...footprint(f) })),
  ];
  for (let t = 0; t <= 1; t += 0.08) {
    const body = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, width: 0.42, depth: 0.42 };
    if(isApartment(home)&&!apartmentWalkable(body.x,body.z,.21))return false;
    if (obstacles.some(obstacle => rectanglesOverlap(body, obstacle, 0.02))) return false;
  }
  return true;
}

const pathLength = path => path.slice(1).reduce((length, p, i) => length + Math.hypot(p.x - path[i].x, p.z - path[i].z), 0);

export function planMeal(home, selectedId, from, grid) {
  const selected = home.furniture.find(f => f.id === selectedId);
  if (!selected) return { error: '这件家具已经不存在了' };
  const tables = selected.type === 'dining' ? [selected] : home.furniture.filter(f => f.type === 'dining');
  if (!tables.length) return { error: '先放置一张带餐椅的餐桌' };
  const candidates = [];
  for (const table of tables) for (const side of [-1, 1]) for (const entrySide of [-1, 1]) {
    const position = localPoint(table, 0, side * 0.79);
    const approach = localPoint(table, entrySide * 1.6, side * 0.79);
    const path = findPath(home, from, approach, grid);
    if (!path.length) continue;
    const end = path.at(-1);
    if (Math.hypot(end.x - approach.x, end.z - approach.z) > 0.38 || !clearCorridor(home, end, position, table.id)) continue;
    const rotation = table.rotation + (side === 1 ? Math.PI : 0);
    const facing = { x: Math.sin(rotation), z: Math.cos(rotation) };
    const right = { x: Math.cos(rotation), z: -Math.sin(rotation) };
    candidates.push({
      targetId: table.id, path, approach: end, seat: position, rotation, seatTop: 0.57,
      floor: surfaceHeight(home, table.x, table.z),
      food: { x: position.x + facing.x * 0.69 + right.x * 0.22, z: position.z + facing.z * 0.69 + right.z * 0.22 },
      distance: pathLength(path),
    });
  }
  return candidates.sort((a, b) => a.distance - b.distance)[0] || { error: '餐椅周围被挡住了，请先挪开家具' };
}

export function planSeat(home, object, from, grid) {
  const heights = { sofa: 0.68, chair: 0.64, bench: 0.60, toilet: 0.59 };
  if (!object || !heights[object.type]) return { error: '这件家具没有可用座位' };
  const seat = localPoint(object, 0, object.type === 'bench' ? 0.08 : object.type === 'toilet' ? 0.1 : 0.18);
  const options = [];
  for (const side of [0, -0.4, 0.4]) {
    const entry = localPoint(object, side, ITEM_MAP[object.type].depth / 2 + 0.9);
    const path = findPath(home, from, entry, grid);
    const end = path.at(-1);
    if (!end || Math.hypot(end.x - entry.x, end.z - entry.z) > 0.4 || !clearCorridor(home, end, seat, object.id)) continue;
    const knee = localPoint(object, 0, (object.type === 'bench' ? 0.08 : 0.18) + 0.68);
    if (!clearCorridor(home, seat, knee, object.id)) continue;
    options.push({ targetId: object.id, seatId: object.id, path, approach: end, seat, rotation: object.rotation,
      floor: surfaceHeight(home, object.x, object.z), seatTop: heights[object.type], distance: pathLength(path) });
  }
  return options.sort((a, b) => a.distance - b.distance)[0] || { error: '座位前方被挡住了，请先挪开家具' };
}

export function planShower(home, object, from, grid) {
  const stand = localPoint(object, 0, 0.04), options = [];
  for (const side of [0, -0.35, 0.35]) {
    const entry = localPoint(object, side, 1.35);
    const path = findPath(home, from, entry, grid), end = path.at(-1);
    if (!end || Math.hypot(end.x - entry.x, end.z - entry.z) > 0.4 || !clearCorridor(home, end, stand, object.id)) continue;
    options.push({ targetId: object.id, path, approach: end, stand, rotation: object.rotation + Math.PI,
      floor: surfaceHeight(home, object.x, object.z), fixture: { ...object }, distance: pathLength(path) });
  }
  return options.sort((a, b) => a.distance - b.distance)[0] || { error: '淋浴间入口被挡住了' };
}

export function planHandwash(home, object, from, grid) {
  const stand=localPoint(object,sinkCenter(object.type),SINK_LAYOUT.standZ), options=[];
  for(const x of [sinkCenter(object.type),-ITEM_MAP[object.type].width/2,ITEM_MAP[object.type].width/2]) {
    const entry=localPoint(object,x,SINK_LAYOUT.standZ+.4);
    const path=findPath(home,from,entry,grid),end=path.at(-1);
    const corner=localPoint(object,x,SINK_LAYOUT.standZ);
    if(!end||Math.hypot(end.x-entry.x,end.z-entry.z)>1||
      !clearCorridor(home,end,corner,object.id)||!clearCorridor(home,corner,stand,object.id))continue;
    const approach=localPoint(object,sinkCenter(object.type),SINK_LAYOUT.standZ+.04);
    if(!clearCorridor(home,corner,approach,object.id))continue;
    const route=[...path,corner,approach];
    options.push({targetId:object.id,path:route,approach,stand,rotation:object.rotation+Math.PI,
      floor:surfaceHeight(home,object.x,object.z),fixture:{...object},distance:pathLength(route)});
  }
  return options.sort((a,b)=>a.distance-b.distance)[0]||{error:'水槽前方被挡住了，请留出洗手的位置'};
}

export function planActivity(home, object, from, grid, height = 1, type = ITEM_MAP[object.type]?.activity) {
  if(!activityTypes(object.type).includes(type))return {error:'这件家具不支持这个活动'};
  if (type === 'eat') return planMeal(home, object.id, from, grid);
  if (type === 'rest' || type === 'toilet') return planSeat(home, object, from, grid);
  if (type === 'sleep') return planSleep(home, object, from, grid, height);
  if (type === 'watch') return planWatch(home, object, from, grid);
  if (type === 'shower') return planShower(home, object, from, grid);
  if (type === 'washHands') return planHandwash(home, object, from, grid);
  const path = findPath(home, from, object, grid);
  const end = path.at(-1);
  if (!end || Math.hypot(end.x - object.x, end.z - object.z) > 2.3) return { error: '暂时无法到达这件家具' };
  return { targetId: object.id, path, approach: end, distance: pathLength(path) };
}

export function planWatch(home, television, from, grid) {
  const options = [];
  for (const seat of home.furniture.filter(item => ['sofa', 'chair', 'bench'].includes(item.type))) {
    const dx = television.x - seat.x, dz = television.z - seat.z, distance = Math.hypot(dx, dz);
    if (distance > 10 || distance < 1 || (Math.sin(seat.rotation) * dx + Math.cos(seat.rotation) * dz) / distance < 0.65) continue;
    const plan = planSeat(home, seat, from, grid);
    if (!plan.error) options.push({ ...plan, targetId: television.id, televisionId: television.id });
  }
  return options.sort((a, b) => a.distance - b.distance)[0] || { error: '请在电视前放置一张朝向屏幕的座椅' };
}

export function planSleep(home, bed, from, grid, height = 1) {
  const options = [];
  for (const side of [-1, 1]) for (const z of [0.3, 0.8]) {
    const entry = localPoint(bed, side * 1.72, z);
    const path = findPath(home, from, entry, grid);
    const end = path.at(-1);
    const edgeSeat=localPoint(bed,side*0.93,z);
    const approach=localPoint(bed,side*(.93+residentLayout.upperLeg*Math.sin(bedSeatAngle(.75,height))*height),z);
    const legClearance=localPoint(bed,side*(0.93+0.98*height),z);
    const sleepHip=localPoint(bed,side*0.5,(residentLayout.mouthHeight-residentLayout.hipHeight)*height-0.95);
    if (!end || Math.hypot(end.x - entry.x, end.z - entry.z) > 0.4 ||
      !clearCorridor(home,end,edgeSeat,bed.id) || !clearCorridor(home,end,legClearance,bed.id)) continue;
    options.push({ targetId: bed.id, path:[...path,approach], approach, bed: { ...bed }, edgeSeat, sleepHip,
      edgeRotation:bed.rotation+side*Math.PI/2, seatTop:0.75,
      pillow: localPoint(bed, side * 0.5, -0.95), side, rotation: bed.rotation,
      floor: surfaceHeight(home, bed.x, bed.z), sleepY: 0.84 + 0.10 * height, distance: pathLength(path) });
  }
  return options.sort((a, b) => a.distance - b.distance)[0] || { error: '床边被挡住了，请留出上下床的空间' };
}

export function planChat(home, position, from, grid) {
  const startAngle = Math.atan2(from.x - position.x, from.z - position.z);
  const options = [];
  for (let i = 0; i < 8; i++) {
    const angle = startAngle + i * Math.PI / 4;
    const point = { x: position.x + Math.sin(angle) * 1.25, z: position.z + Math.cos(angle) * 1.25 };
    const path = findPath(home, from, point, grid), end = path.at(-1);
    if (!end || Math.hypot(end.x - position.x, end.z - position.z) < 0.85 || Math.hypot(end.x - point.x, end.z - point.z) > 0.4) continue;
    options.push({ path, approach: end, rotation: Math.atan2(position.x - end.x, position.z - end.z), distance: pathLength(path) });
  }
  return options.sort((a, b) => a.distance - b.distance)[0] || { error: '暂时无法走到这位邻居身边' };
}
