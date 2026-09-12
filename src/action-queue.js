import { ACTIVITIES, ITEM_MAP, activityTypes, uid } from './game.js';
import { FISHING_SPOTS } from './fishing.js';

export class ActionQueue {
  constructor(world) {
    this.world = world;
    this.items = [];
  }

  add(command) {
    const { world } = this;
    if (world.state.mode !== 'live' || world.state.game.onboarding === false) return false;
    if (this.items.length >= 8) { world.emit({ type:'toast', message:'待办队列最多 8 项' }); return false; }
    let label, detail;
    if (command.kind === 'furniture') {
      const object = world.state.game.home.furniture.find(f => f.id === command.targetId);
      const info = object && ITEM_MAP[object.type];
      const activity=command.activity||info?.activity;
      if (!info || !activityTypes(object.type).includes(activity)) return false;
      label = ACTIVITIES[activity].label; detail = info.name;
    } else if (command.kind === 'chat') {
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
    if (world.state.mode !== 'live' || !world.state.speed || world.activities.current || world.path.length) return;
    while (this.items.length) {
      const next = this.items.shift();
      this.emit();
      const started = next.kind === 'furniture' ? world.activities.start(next.targetId,next.recipe,{activity:next.activity})
        : next.kind === 'chat' ? world.activities.startChat(next.targetId)
          : next.kind === 'fish' ? world.activities.startFishing(next.targetId)
            : world.navigateTo(next.target);
      if (started) return;
      world.emit({ type:'toast', message:`已跳过无法执行的${next.label}` });
    }
  }
}
