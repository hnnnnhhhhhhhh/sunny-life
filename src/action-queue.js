import { ACTIVITIES, ITEM_MAP, activityTypes, uid } from './game.js';
import { FISHING_SPOTS } from './fishing.js';
import { isApartment } from './residence.js';
import {atWork,departureError} from './career.js';
import {awayShopping,shoppingError,laundryError} from './life.js';
import {SOCIAL_ACTIONS,friendById,socialActionError} from './social.js';
import {serviceError} from './finance.js';

export class ActionQueue {
  constructor(world) {
    this.world = world;
    this.items = [];
  }

  add(command) {
    const { world } = this;
    if (world.state.mode !== 'live' || world.state.game.onboarding === false||atWork(world.state.game)||world.departingWork||
      awayShopping(world.state.game)||world.departingShopping) return false;
    if (this.items.length >= 8) { world.emit({ type:'toast', message:'待办队列最多 8 项' }); return false; }
    let label, detail;
    if(command.kind==='guest'){
      const error=socialActionError(world.state.game,command.targetId,command.verb);
      if(error){world.emit({type:'toast',message:error});return false;}
      label=SOCIAL_ACTIONS[command.verb].label;detail=friendById(command.targetId).name;
    }else if(command.kind==='shopping'||command.kind==='laundry'){
      const error=command.kind==='shopping'?shoppingError(world.state.game):laundryError(world.state.game,command.task);
      if(error){world.emit({type:'toast',message:error});return false;}
      label=command.kind==='shopping'?'出门购物':command.task==='wash'?'洗衣服':'晾晒衣物';detail='日常生活';
    }else if(command.kind==='work'){
      const error=departureError(world.state.game);
      if(error){world.emit({type:'toast',message:error});return false;}
      label='出门上班';detail='工作场所';
    }else if (command.kind === 'furniture') {
      const object = world.state.game.home.furniture.find(f => f.id === command.targetId);
      const info = object && ITEM_MAP[object.type];
      const activity=command.activity||info?.activity;
      if (!info || !activityTypes(object.type).includes(activity)) return false;
      label = ACTIVITIES[activity].label; detail = info.name;
    } else if (command.kind === 'chat') {
      if(isApartment(world.state.game.home))return false;
      const person = world.npcs.find(n => n.id === command.targetId);
      if (!person) return false;
      label = '聊天'; detail = person.data.name;
    } else if (command.kind === 'fish') {
      const spot = FISHING_SPOTS.find(s => s.id === command.targetId);
      if (!spot) return false;
      label = '钓鱼'; detail = spot.name;
    } else {
      label = '散步'; detail = command.label || '目的地';
    }
    this.items.push({ ...command, id:uid(), label, detail });
    world.autonomy.manual();
    world.emit({ type:'dismissInteraction' });
    if (world.activities.current?.autonomous) world.activities.cancel(false);
    this.emit();
    this.update();
    return true;
  }

  remove(id) {
    this.items = this.items.filter(item => item.id !== id);
    this.emit();
  }

  moveUp(id) {
    const i = this.items.findIndex(item => item.id === id);
    if (i > 0) [this.items[i-1],this.items[i]] = [this.items[i],this.items[i-1]];
    this.emit();
  }

  clear() { this.items = []; this.emit(); }

  emit() {
    this.world.emit({ type:'queue', queue:this.items.map(({ id,kind,label,detail }) => ({ id,kind,label,detail })) });
  }

  update() {
    const { world } = this;
    if (world.state.mode !== 'live' || !world.state.speed || world.activities.current || world.path.length||world.departingWork||atWork(world.state.game)||
      awayShopping(world.state.game)||world.departingShopping||world.state.game.dialogue?.active) return;
    while (this.items.length) {
      const next = this.items.shift();
      this.emit();
      if(next.kind==='furniture'){
        const object=world.state.game.home.furniture.find(f=>f.id===next.targetId);
        const reason=object&&serviceError(world.state.game,next.activity||ITEM_MAP[object.type].activity,next.recipe||'pancakes');
        if(reason){world.emit({type:'toast',message:reason});continue;}
      }
      const started = next.kind==='guest'?world.activities.startGuest(next.targetId,next.verb):
        next.kind==='shopping'?world.startShopping(next.companionId):next.kind==='laundry'?world.activities.startLaundry(next.task):
        next.kind==='work'?world.startWork():next.kind === 'furniture' ? world.activities.start(next.targetId,next.recipe,{activity:next.activity,channel:next.channel})
        : next.kind === 'chat' ? world.activities.startChat(next.targetId)
          : next.kind === 'fish' ? world.activities.startFishing(next.targetId)
            : world.navigateTo(next.target);
      if (started) return;
      world.emit({ type:'toast', message:`已跳过无法执行的${next.label}` });
    }
  }
}
