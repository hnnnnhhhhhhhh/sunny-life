import { ACTIVITIES, ITEM_MAP, activityTypes, findPath } from './game.js';
import { planActivity, planChat } from './interactions.js';
import { isApartment } from './residence.js';
import {floorRegions} from './architecture.js';
import {awayShopping} from './life.js';
import {serviceError,utilities} from './finance.js';

const THRESHOLDS = { hunger: 48, energy: 38, bladder: 45, hygiene: 70, social: 35, fun: 35 };
const PRIORITIES = { hunger: 1.2, energy: 1.1, bladder: 1.5, hygiene: 1, social: 0.7, fun: 0.65 };

export function autonomousCandidates(game, from, grid, neighbors = []) {
  const candidates = [];
  for (const object of game.home.furniture) {
    const type = ITEM_MAP[object.type].activity, definition = ACTIVITIES[type];
    if(serviceError(game,type,type==='eat'?'toast':undefined))continue;
    if (!definition || type==='washHands' || game.sim.needs[definition.need] >= THRESHOLDS[definition.need]) continue;
    const plan = planActivity(game.home, object, from, grid, game.avatar.height);
    if (plan.error) continue;
    candidates.push({ id: object.id, type, plan, score: (100 - game.sim.needs[definition.need]) * PRIORITIES[definition.need] +
      Math.min(definition.amount, 100 - game.sim.needs[definition.need]) * 0.15 - plan.distance * 0.5 });
  }
  if (!isApartment(game.home) && game.sim.needs.social < THRESHOLDS.social) for (const npc of neighbors.filter(n => !n.busy)) {
    const plan = planChat(game.home, npc.mesh.position, from, grid);
    if (!plan.error) candidates.push({ id: npc.id, type: 'chat', plan, score: (100 - game.sim.needs.social) * PRIORITIES.social - plan.distance * 0.5 });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export function leisureCandidates(game,from,grid,lastId) {
  const candidates=[];
  for(const object of game.home.furniture){
    const type=activityTypes(object.type).find(type=>['rest','watch','onlineChat'].includes(type));
    if(!type)continue;
    if(serviceError(game,type))continue;
    const plan=planActivity(game.home,object,from,grid,game.avatar.height,type);
    if(plan.error)continue;
    const need=ACTIVITIES[type].need;
    const variety=object.id===lastId?-60:0;
    candidates.push({id:object.id,type,plan,score:variety+(100-game.sim.needs[need])*.35-plan.distance*.15});
  }
  return candidates.sort((a,b)=>b.score-a.score);
}

export function idleWalkPlan(game,from,grid,sequence=0){
  const targets=floorRegions(game.home).filter(r=>r.id!=='corridor').flatMap(r=>{
    const cx=(r.x1+r.x2)/2,cz=(r.z1+r.z2)/2;
    return [{x:cx,z:cz},{x:r.x1+.8,z:cz},{x:r.x2-.8,z:cz},{x:cx,z:r.z1+.8},{x:cx,z:r.z2-.8}];
  });
  for(let i=0;i<targets.length;i++){
    const target=targets[(i+sequence)%targets.length];
    if(Math.hypot(target.x-from.x,target.z-from.z)<1.4)continue;
    const path=findPath(game.home,from,target,grid),end=path.at(-1);
    if(end&&Math.hypot(end.x-target.x,end.z-target.z)<.35&&path.length>1)return {target,path};
  }
  return null;
}

export class Autonomy {
  constructor(world) {
    this.world = world;
    this.cooldown = 6;
    this.blocked = false;
    this.leisureCount=0;
    this.walking=false;
    this.lastLeisureId=null;
  }

  manual() {
    if(this.walking){
      this.world.path=[];this.world.destination.visible=false;
      this.world.emit({type:'arrived'});this.walking=false;
    }
    this.cooldown = 12;
    this.blocked = false;
  }

  update(delta) {
    const { world } = this, { game, mode, speed } = world.state;
    if (mode !== 'live' || !speed || !game.sim.autonomy) return;
    if(awayShopping(game)||world.departingShopping)return;
    if (world.activities.current || world.path.length || world.queue.items.length) { this.cooldown = Math.max(this.cooldown, 4); return; }
    this.walking=false;
    this.cooldown -= delta;
    if (this.cooldown > 0) return;
    let candidate = autonomousCandidates(game, world.player.position, world.navGrid, world.npcs)[0];
    this.cooldown = candidate ? 4 : 15;
    this.blocked = !candidate && Object.entries(THRESHOLDS).some(([key, threshold]) => game.sim.needs[key] < threshold);
    if(!candidate&&game.life?.laundry.returnPending){
      const stage=game.life.laundry.stage;
      const task=['dirty','washing'].includes(stage)?'wash':['wet','hanging'].includes(stage)?'hang':null;
      if(task&&world.activities.startLaundry(task,{autonomous:true}))return;
    }
    if (!candidate&&!this.blocked){
      if(game.social?.visit)return;
      const leisure=leisureCandidates(game,world.player.position,world.navGrid,this.lastLeisureId);
      if(this.leisureCount%3===2||!leisure.length){
        const walk=idleWalkPlan(game,world.player.position,world.navGrid,this.leisureCount);
        if(walk){
          world.path=walk.path;world.destination.visible=false;world.arrivalActivity=null;
          world.emit({type:'walking'});this.walking=true;this.leisureCount++;this.cooldown=14;
          return;
        }
      }
      candidate=leisure[0];
      if(candidate){this.lastLeisureId=candidate.id;this.leisureCount++;this.cooldown=10;}
    }
    if(!candidate)return;
    const options = { autonomous: true, plan: candidate.plan, activity:candidate.type };
    if (candidate.type === 'chat') world.activities.startChat(candidate.id, options);
    else world.activities.start(candidate.id, game.budget>=10&&utilities(game).power?'noodles':'toast', options);
  }
}
