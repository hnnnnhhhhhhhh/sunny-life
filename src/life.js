import {addEmotion} from './emotions.js';
import {utilities} from './finance.js';
export const SLEEP_MINUTES = 360;
export const DAYS_PER_YEAR = 28;
export const LAUNDRY_MINUTES = Object.freeze({ wash: 30, hang: 10, dry: 180 });
export const SHOPPING = Object.freeze({ price: 80, duration: 90, fun: 32, social: 16 });
export const HOMES = Object.freeze([
  { id: 'garden', name: '花园大宅', price: 45000, earned: 8000, salary: 500, width: 14, depth: 11 },
  { id: 'villa', name: '宽庭别墅', price: 120000, earned: 40000, salary: 1000, width: 16, depth: 14 },
]);
export const RETIREMENT = Object.freeze({ early: 180000, regular: 90000, pension: 100 });
const clamp = (n, max = 100) => Math.max(0, Math.min(max, n));
export const simTime = sim => (sim.day - 1) * 1440 + sim.time;
export const motionRate = speed => speed === 0 ? 0 : 1 + (speed - 1) * .3;
export function newLife(day = 1) {
  return {
    bornDay: day, startAge: 24, retired: false, retiredDay: null, pensionDay: day,
    housing: 0, sleep: null, shopping: null, lastShoppingDay: 0,
    laundry: { stage: 'dirty', elapsed: 0, cycles: 0, lastDay: day, returnPending: true },
  };
}
export const ageFor = game => Math.min(100, (game.life?.startAge ?? 24) +
  Math.floor(Math.max(0, game.sim.day - (game.life?.bornDay ?? 1)) / DAYS_PER_YEAR));
export function ageEffects(game) {
  const age = ageFor(game);
  return { label: age < 40 ? '青年' : age < 60 ? '中年' : '长者',
    movement: age < 60 ? 1 : .85, fatigue: age < 40 ? 1 : age < 60 ? 1.08 : 1.2,
    qualification: age < 40 ? 1 : age < 60 ? 1.1 : 1.05 };
}
export const awayShopping = game => !!game.life?.shopping;
export function shoppingError(game) {
  if (game.career?.location === 'office') return '先下班回家';
  if (awayShopping(game)) return '正在外出购物';
  if (game.social?.visit) return '先送来访的朋友离开';
  if (game.budget < SHOPPING.price) return '余额不足 80 生活币';
  if (game.sim.needs.energy < 15 || game.sim.needs.hunger < 15) return '先休息或吃点东西';
  return null;
}
export function laundryError(game, kind) {
  if (game.career?.location === 'office' || awayShopping(game)) return '回家后再处理衣物';
  const stage = game.life.laundry.stage;
  if (kind === 'wash' && !['dirty', 'washing'].includes(stage)) return '没有待洗衣物';
  if (kind === 'hang' && !['wet', 'hanging'].includes(stage)) return '先把衣服洗好';
  return null;
}
export function retirementError(game) {
  if (game.life.retired) return '已退休';
  if (game.career?.workplace?.event?.type === 'appraisal') return '先处理绩效复核，再办理退休';
  if (game.career?.attendance?.review) return '先处理缺勤复核';
  if (game.career?.location === 'office' || awayShopping(game)) return '回家后办理退休';
  const target = ageFor(game) >= 60 ? RETIREMENT.regular : RETIREMENT.early;
  if (game.budget < target) return `需要储蓄 ${target.toLocaleString()} 生活币`;
  if (game.career.totalEarned < 20000) return '累计工作收入需达到 20,000 生活币';
  return null;
}
export function housingError(game, salary) {
  const target = HOMES[game.life.housing];
  if (!target) return '已拥有最大住宅';
  if (game.career?.location === 'office' || awayShopping(game)||game.social?.visit) return '独自在家时再搬迁';
  if (game.budget < target.price) return `还需 ${Math.ceil(target.price - game.budget).toLocaleString()} 生活币`;
  if (game.career.totalEarned < target.earned) return `累计工作收入需达到 ${target.earned.toLocaleString()}`;
  if (salary < target.salary && !game.life.retired) return `日薪需达到 ${target.salary}`;
  if((game.home.rooms||[]).some(r=>r.x1<target.width/2&&r.x2>-target.width/2&&r.z1<target.depth/2&&r.z2>-target.depth/2&&
    !(r.x1>=-target.width/2&&r.x2<=target.width/2&&r.z1>=-target.depth/2&&r.z2<=target.depth/2)))
    return '请先调整与新外墙重叠的扩建房间';
  return null;
}
export function lifeAction(game, action) {
  const life = game.life;
  if (!life) return game;
  if (action.kind === 'sleepStart') {
    if (life.sleep || awayShopping(game) || game.career?.location === 'office' ||
      !game.home.furniture.some(f => f.id === action.bedId && f.type === 'bed')) return game;
    return { ...game, life: { ...life, sleep: { bedId: action.bedId, elapsed: 0, startEnergy: game.sim.needs.energy } } };
  }
  if (action.kind === 'sleepStop') return { ...game, life: { ...life, sleep: null } };
  if (action.kind === 'shoppingStart') {
    if (shoppingError(game)) return game;
    if(action.companionId&&(!game.social?.contacts.some(c=>c.id===action.companionId)||!utilities(game).phone))return game;
    return { ...game, budget: game.budget - SHOPPING.price, life: { ...life, sleep: null,
      shopping: { elapsed: 0, x: game.sim.x, z: game.sim.z,...(action.companionId?{companionId:action.companionId}:{}) } } };
  }
  if (action.kind === 'shoppingReturn' && life.shopping) return returnFromShopping(game, false);
  if (action.kind === 'laundryStart' && ['wash', 'hang'].includes(action.task)) {
    if (laundryError(game, action.task)) return game;
    const stage = action.task === 'wash' ? 'washing' : 'hanging';
    return { ...game, life: { ...life, laundry: { ...life.laundry, stage,
      returnPending:true,elapsed: life.laundry.stage === stage ? life.laundry.elapsed : 0 } } };
  }
  if (action.kind === 'retire' && !retirementError(game)) return { ...game,
    career: { ...game.career, jobId: null },
    life: { ...life, retired: true, retiredDay: game.sim.day, pensionDay: game.sim.day } };
  return game;
}
function returnFromShopping(game, completed) {
  const { life, sim } = game, trip = life.shopping;
  let result={ ...game, sim: { ...sim, x: trip.x, z: trip.z },
    life: { ...life, shopping: null, lastShoppingDay: completed ? sim.day : life.lastShoppingDay,
      laundry: { ...life.laundry, returnPending: true } } };
  if(trip.companionId&&completed){
    result={...result,social:{...game.social,contacts:game.social.contacts.map(c=>c.id===trip.companionId?
      {...c,friendship:clamp(c.friendship+8),satisfaction:clamp(c.satisfaction+5)}:c)}};
    result=addEmotion(result,'outing','happy','与朋友一起出门散心',30,180);
  }
  return result;
}
// Clock-owned effects survive reload; physical entry/exit is owned by ActivityRunner.
export function advanceLife(before, game, minutes, context = {}) {
  let life = { ...game.life, laundry: { ...game.life.laundry } };
  const needs = { ...game.sim.needs }, laundry = life.laundry;
  if (before.career?.location === 'office' && game.career.location === 'home') laundry.returnPending = true;
  if (laundry.stage === 'clean' && game.sim.day > laundry.lastDay) {
    laundry.stage = 'dirty'; laundry.elapsed = 0;
  }
  const sleeping = life.sleep && life.sleep.elapsed < SLEEP_MINUTES && (context.sleeping ?? true) && game.career.location === 'home' && !life.shopping;
  if (sleeping) {
    const previous = life.sleep.elapsed;
    const elapsed = Math.min(SLEEP_MINUTES, previous + minutes);
    const target = Math.max(95, life.sleep.startEnergy);
    const energy = life.sleep.startEnergy + (target - life.sleep.startEnergy) * elapsed / SLEEP_MINUTES;
    needs.energy = Math.max(needs.energy, energy);
    life.sleep = { ...life.sleep, elapsed };
  } else {
    needs.energy = clamp(needs.energy - minutes * .0625 * (ageEffects(game).fatigue - 1));
  }
  const task = context.laundry;
  if ((task === 'wash' && laundry.stage === 'washing') || (task === 'hang' && laundry.stage === 'hanging')) {
    laundry.elapsed = Math.min(LAUNDRY_MINUTES[task], laundry.elapsed + minutes);
    if (laundry.elapsed >= LAUNDRY_MINUTES[task]) {
      laundry.stage = task === 'wash' ? 'wet' : 'drying'; laundry.elapsed = 0;
    }
  } else if (laundry.stage === 'drying') {
    laundry.elapsed = Math.min(LAUNDRY_MINUTES.dry, laundry.elapsed + minutes);
    if (laundry.elapsed >= LAUNDRY_MINUTES.dry) {
      laundry.stage = 'clean'; laundry.elapsed = 0; laundry.cycles++;
      laundry.returnPending = false; laundry.lastDay = game.sim.day;
    }
  }
  if (life.shopping) {
    const step = Math.min(minutes, SHOPPING.duration - life.shopping.elapsed);
    life.shopping = { ...life.shopping, elapsed: life.shopping.elapsed + step };
    needs.fun = clamp(needs.fun + SHOPPING.fun * step / SHOPPING.duration);
    needs.social = clamp(needs.social + SHOPPING.social * step / SHOPPING.duration);
  }
  let budget = game.budget;
  if (life.retired && game.sim.day > life.pensionDay) {
    budget = Math.min(1000000, budget + (game.sim.day - life.pensionDay) * RETIREMENT.pension);
    life.pensionDay = game.sim.day;
  }
  let result = { ...game, budget, sim: { ...game.sim, needs }, life };
  if (life.shopping && (life.shopping.elapsed >= SHOPPING.duration || Math.min(needs.energy, needs.hunger) < 5))
    result = returnFromShopping(result, life.shopping.elapsed >= SHOPPING.duration);
  return result;
}
const number = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const integer = (v, min, max) => Number.isInteger(v) && number(v, min, max);
export function validateLife(life, sim, home) {
  if (life === undefined) return true;
  if (!life || !integer(life.bornDay, 1, sim.day) || !integer(life.startAge, 18, 100) ||
    typeof life.retired !== 'boolean' || !integer(life.housing, 0, HOMES.length) ||
    !integer(life.pensionDay, 1, sim.day) || !integer(life.lastShoppingDay, 0, sim.day) ||
    !(life.retired ? integer(life.retiredDay, 1, sim.day) : life.retiredDay === null)) return false;
  const l = life.laundry, s = life.sleep, trip = life.shopping;
  if (!l || !['dirty', 'washing', 'wet', 'hanging', 'drying', 'clean'].includes(l.stage) ||
    !number(l.elapsed, 0, l.stage === 'washing' ? 30 : l.stage === 'hanging' ? 10 : l.stage === 'drying' ? 180 : 0) ||
    !integer(l.cycles, 0, 1e7) || !integer(l.lastDay, 1, sim.day) || typeof l.returnPending !== 'boolean') return false;
  if (s !== null && (!s || typeof s.bedId !== 'string' || !number(s.elapsed, 0, SLEEP_MINUTES) ||
    !number(s.startEnergy, 0, 100) || !home.furniture.some(f => f.id === s.bedId && f.type === 'bed'))) return false;
  return trip === null || !!trip && s === null && number(trip.elapsed, 0, SHOPPING.duration) &&
    number(trip.x, -38, 38) && number(trip.z, -38, 38)&&
    (trip.companionId===undefined||['neighbor-1','neighbor-2','neighbor-3'].includes(trip.companionId));
}
