import * as THREE from 'three';
import { ACTIVITIES, ITEM_MAP, activityTypes, surfaceHeight } from './game.js';
import { MEALS, planActivity, planChat, localPoint, STAGE_LABELS } from './interactions.js';
import { createMeal } from './meal-props.js';
import { createSleepCover } from './activity-props.js';
import { createBathroomEffects } from './bathroom-effects.js';
import { createFishingProps, planFishing } from './fishing.js';
import { BED_TIMING, bedPoseAt } from './bed-motion.js';
import { createHandwashEffects, handwashTargets, handwashPhase, HANDWASH_DURATION } from './handwashing.js';

const ease = value => THREE.MathUtils.smoothstep(value, 0, 1);

export class ActivityRunner {
  constructor(world) {
    this.world = world;
    this.current = null;
    this.lastEmit = 0;
  }

  start(id, recipe = 'pancakes', options = {}) {
    this.cancel(true);
    const { world } = this;
    const home = world.state.game.home;
    const object = home.furniture.find(item => item.id === id);
    const type = options.activity || (object && ITEM_MAP[object.type].activity);
    if (!object || !activityTypes(object.type).includes(type)) return false;
    if(['sleep','washHands'].includes(type)&&!world.player.userData.controller) {
      if(!options.autonomous)world.emit({type:'toast',message:'人物动作资源未加载成功，请刷新后重试'});
      return false;
    }
    const from = { x: world.player.position.x, z: world.player.position.z };
    const plan = options.plan || planActivity(home, object, from, world.navGrid, world.state.game.avatar.height,type);
    if (plan.error) { if (!options.autonomous) world.emit({ type: 'toast', message: plan.error }); return false; }
    this.current = { ...plan, type, autonomous: !!options.autonomous, fixture: { ...object }, recipe: MEALS[recipe] ? recipe : 'pancakes', stage: 'approach', elapsed: 0, progress: 0, duration: { rest: 14, watch: 16, sleep: 18, shower: 14, toilet: 9, washHands:HANDWASH_DURATION }[type] || 6.25 };
    world.path = plan.path.slice();
    world.arrivalActivity = null;
    const end = plan.path.at(-1);
    world.destination.position.set(end.x, surfaceHeight(home, end.x, end.z) + 0.03, end.z);
    world.destination.visible = true;
    world.emit({ type: 'walking' });
    this.emit();
    return true;
  }

  startChat(id, options = {}) {
    this.cancel(true);
    const { world } = this;
    const npc = world.npcs.find(person => person.id === id);
    if (!npc || npc.busy) return false;
    const plan = options.plan || planChat(world.state.game.home, npc.mesh.position, world.player.position, world.navGrid);
    if (plan.error) { if (!options.autonomous) world.emit({ type: 'toast', message: plan.error }); return false; }
    npc.busy = true;
    npc.conversationClip = 'Idle';
    this.current = { ...plan, type: 'chat', autonomous: !!options.autonomous, npcId: id, partnerName: npc.data.name, stage: 'approach', elapsed: 0, progress: 0, duration: 10 };
    world.path = plan.path.slice();
    world.arrivalActivity = null;
    const end = plan.path.at(-1);
    world.destination.position.set(end.x, surfaceHeight(world.state.game.home, end.x, end.z) + 0.03, end.z);
    world.destination.visible = true;
    world.emitNeighbors();
    world.emit({ type: 'walking' });
    this.emit();
    return true;
  }

  startFishing(id) {
    this.cancel(true);
    const { world } = this;
    const plan = planFishing(world.state.game.home,id,world.player.position,world.navGrid);
    if (plan.error) { world.emit({ type:'toast',message:plan.error }); return false; }
    this.current = { ...plan, type:'fish', stage:'approach', elapsed:0, progress:0, duration:18 };
    world.path=plan.path.slice();
    world.destination.position.set(plan.approach.x,plan.floor+0.03,plan.approach.z);
    world.destination.visible=true;
    world.emit({ type:'walking' }); this.emit(); return true;
  }

  genericAfterWalk(type) {
    this.current = { type, stage: 'active', elapsed: 0, progress: 0 };
    this.emit();
  }

  arrive() {
    if (!this.current || this.current.stage !== 'approach') return false;
    this.current.stage = this.current.seat ? 'seating' : this.current.type === 'sleep' ? 'bed-sit' : ['shower','washHands'].includes(this.current.type) ? 'entering' : 'active';
    this.current.elapsed = 0;
    this.current.startRotation = this.world.player.rotation.y;
    this.world.player.userData.controller?.play(this.current.seat ? 'SitDown' : 'Idle',this.current.type==='sleep'?0:0.15);
    this.world.emit({ type: 'arrived' });
    if (['toilet', 'shower'].includes(this.current.type)) {
      this.bathroom = createBathroomEffects(this.current.type, this.current.fixture, this.current.floor);
      this.bathroom.group.visible = false;
      this.world.worldRoot.add(this.bathroom.group);
    }
    if (this.current.type === 'fish') {
      this.fishing = createFishingProps(this.world.state.game.sim.catches.length);
      this.world.worldRoot.add(this.fishing.group);
      this.world.command('fishing',this.current);
    }
    if(this.current.type==='washHands') {
      this.handwashing=createHandwashEffects(this.current.fixture,this.current.floor,this.world.items.get(this.current.targetId)?.mesh);
      this.world.worldRoot.add(this.handwashing.root);
    }
    if (this.current.autonomous) { this.emit(); return true; }
    if (this.current.type === 'eat') {
      const table = this.world.state.game.home.furniture.find(item => item.id === this.current.targetId);
      this.world.command('dining', { x: table.x, z: table.z, floor: this.current.floor });
    } else if (this.current.type === 'watch') {
      const television = this.world.state.game.home.furniture.find(item => item.id === this.current.televisionId);
      this.world.command('television', { ...television, seat: this.current.seat, floor: this.current.floor });
    } else if (['sleep', 'shower','washHands'].includes(this.current.type) || this.current.seat) {
      const target = this.world.state.game.home.furniture.find(item => item.id === (this.current.seatId || this.current.targetId));
      this.world.command('activity', { x: target.x, z: target.z, floor: this.current.floor });
    }
    this.emit();
    return true;
  }

  emit() {
    const action = this.current;
    let label = action && (action.stage === 'approach' ? '正在前往' : ACTIVITIES[action.type].status);
    if (action?.type === 'eat') label = STAGE_LABELS[action.stage];
    else if (action?.type === 'chat') label = action.stage === 'approach' ? `走向${action.partnerName}` : `与${action.partnerName}聊天`;
    else if (action?.type === 'sleep') label = { approach:'走到床边','bed-sit':'坐到床沿','bed-legs':'抬腿上床',
      'bed-recline':'缓缓躺下',active:'熟睡中','bed-rise':'撑起上身','bed-lower':'双脚落地','bed-stand':'从床边起身' }[action.stage];
    else if (action?.type === 'shower') label = { approach: '前往淋浴间', entering: '进入淋浴间', active: '正在淋浴', standing: '擦干离开', cancelling: '离开淋浴间' }[action.stage];
    else if(action?.type==='washHands') label=action.stage==='active'
      ? {'tap-on':'打开水龙头',soap:'取洗手液',rub:'搓洗双手',rinse:'冲净泡沫','tap-off':'关闭水龙头',dry:'擦干双手'}[handwashPhase(action.washTime||0)]
      : {approach:'走向水槽',entering:'伸手准备',standing:'洗手完成',cancelling:'关水离开'}[action.stage];
    else if (action?.type === 'toilet') label = { approach: '前往洗手间', seating: '正在入座', active: '正在如厕', standing: '冲水离开', cancelling: '离开洗手间' }[action.stage];
    else if (action?.type === 'fish') label = action.stage === 'approach' ? `走向${action.spot.name}` :
      action.elapsed < 2 ? '正在抛竿' : action.elapsed < 12 ? '等待咬钩' : action.elapsed < 16 ? '收线中' : '收获鱼儿';
    else if (action?.seat && action.stage !== 'active') label = { approach: '走向座位', seating: '正在坐下', standing: '正在起身', cancelling: '正在起身' }[action.stage];
    this.world.emit({
      type: 'activity',
      activity: action ? {
        type: action.type, stage: action.stage, progress: Math.round(action.progress * 100),
        label: action.autonomous ? `自主 · ${label}` : label, autonomous: action.autonomous,
        meal: action.type === 'eat' ? MEALS[action.recipe].name : null,
      } : null,
    });
  }

  cancel(immediate = false, after, quiet = false) {
    const action = this.current;
    if (!action) { after?.(); return; }
    if (!immediate && action.stage === 'cancelling') { action.after = after; return; }
    this.world.path = [];
    this.world.destination.visible = false;
    if (immediate) action.after = null;
    if (!immediate && action.type==='sleep' && action.stage!=='approach') {
      action.bedExiting=true; action.completed=false; action.after=after;
      action.stage=bedPoseAt(action.bedTime||0,action,this.world.state.game.avatar.height,true).stage;
      this.emit(); return;
    }
    if (!immediate && (action.seat || ['sleep', 'shower','washHands'].includes(action.type)) && ['seating', 'lying', 'entering', 'active', 'standing'].includes(action.stage)) {
      action.exitWeight = action.poseWeight ?? 1;
      action.exitTravel = action.travelWeight ?? 1;
      action.stage = 'cancelling';
      action.elapsed = 0;
      action.after = after;
      this.world.player.userData.controller?.play(action.seat ? 'StandUp' : 'Idle', 0.1);
      this.emit();
      return;
    }
    action.after = null;
    this.finish(false, !quiet);
    after?.();
  }

  finish(completed, notifyPosition = true) {
    const action = this.current;
    if (!action) return;
    const { world } = this;
    if (notifyPosition) this.creditProgress(action);
    world.player.userData.controller?.showAccessory('fork', false);
    world.player.userData.controller?.showAccessory('bite', false);
    world.player.userData.controller?.sleepWear(false);
    world.player.userData.controller?.play('Idle', 0.08);
    if ((action.seat || ['sleep', 'shower','washHands'].includes(action.type)) && action.stage !== 'approach') {
      world.player.position.set(action.approach.x, surfaceHeight(world.state.game.home, action.approach.x, action.approach.z), action.approach.z);
      world.player.rotation.set(0, action.type==='sleep'?(action.startRotation??action.edgeRotation):action.rotation, 0);
      const decor = world.items.get(action.targetId)?.mesh.getObjectByName('DiningDecor');
      if (decor) decor.visible = true;
      if (this.meal) { world.worldRoot.remove(this.meal.group); this.meal.dispose(); this.meal = null; }
    }
    if (this.cover) { world.worldRoot.remove(this.cover.mesh); this.cover.dispose(); this.cover = null; }
    if (this.bathroom) { world.worldRoot.remove(this.bathroom.group); this.bathroom.dispose(); this.bathroom = null; }
    if (this.handwashing) { world.worldRoot.remove(this.handwashing.root); this.handwashing.dispose(); this.handwashing=null; }
    if (this.fishing) {
      if (completed) world.emit({ type:'fishCaught', fish:this.fishing.caught });
      world.worldRoot.remove(this.fishing.group); this.fishing.dispose(); this.fishing=null;
    }
    const toiletWater = world.items.get(action.targetId)?.mesh.getObjectByName('ToiletWater');
    if (toiletWater) toiletWater.scale.set(1, 1, 1.28);
    if (action.televisionId) world.items.get(action.televisionId)?.mesh.userData.screenPlayback?.setPlaying(false);
    if (action.npcId) {
      const npc = world.npcs.find(person => person.id === action.npcId);
      if (npc) { npc.busy = false; npc.conversationClip = null; npc.mesh.userData.controller?.play('Idle'); }
      world.emitNeighbors();
    }
    this.current = null;
    world.emit({ type: 'arrived' });
    if (notifyPosition) world.emit({ type: 'position', x: world.player.position.x, z: world.player.position.z });
    this.emit();
    if (completed) world.emit({ type: 'activityComplete', activity: action.type, autonomous: action.autonomous });
    action.after?.();
  }

  creditProgress(action = this.current) {
    if (!action) return;
    const total = action.type === 'eat' ? MEALS[action.recipe].amount : ACTIVITIES[action.type].amount;
    const earned = total * action.progress;
    const amount = earned - (action.credited || 0);
    if (amount > 0) {
      action.credited = earned;
      this.world.emit({ type:'needGain', need:ACTIVITIES[action.type].need, amount });
    }
  }

  update(delta, walking) {
    const { world } = this, animator = world.player.userData.controller;
    const action = this.current;
    if (action?.npcId) {
      const npc = world.npcs.find(person => person.id === action.npcId);
      if (!npc) { this.cancel(true); return; }
      npc.mesh.rotation.y = Math.atan2(world.player.position.x - npc.mesh.position.x, world.player.position.z - npc.mesh.position.z);
    }
    if (!action || action.stage === 'approach') {
      animator?.play(walking ? 'Walk' : 'Idle');
      animator?.update(delta);
      return;
    }
    if (action.targetId && !world.state.game.home.furniture.some(item => item.id === action.targetId)) {
      this.cancel(true); return;
    }
    action.elapsed += delta;
    if (action.type === 'sleep') {
      this.updateSleep(delta);
    } else if (action.type === 'shower') {
      this.updateShower(delta);
    } else if (action.type === 'washHands') {
      this.updateHandwash(delta);
    } else if (action.type === 'fish') {
      world.player.rotation.y=action.rotation;
      animator?.play('Idle'); animator?.update(delta); animator?.fishingPose(action.elapsed);
      this.fishing?.update(action,animator);
      action.progress=Math.min(1,action.elapsed/action.duration);
      if (action.progress === 1) { this.finish(true); return; }
    } else if (action.type === 'chat') {
      const npc = world.npcs.find(person => person.id === action.npcId);
      const speaking = Math.floor(action.elapsed / 2) % 2 === 0;
      world.player.rotation.y = Math.atan2(npc.mesh.position.x - world.player.position.x, npc.mesh.position.z - world.player.position.z);
      animator?.play(speaking ? 'Talk' : 'Listen');
      animator?.update(delta);
      npc.conversationClip = speaking ? 'Listen' : 'Talk';
      action.progress = Math.min(1, action.elapsed / action.duration);
      if (action.progress === 1) { this.finish(true); return; }
    } else if (!action.seat) {
      animator?.play('Idle'); animator?.update(delta);
      action.progress = Math.min(1, action.elapsed / 6.25);
      if (action.progress === 1) { this.finish(true); return; }
    } else {
      const entering = action.stage === 'seating', exiting = ['standing', 'cancelling'].includes(action.stage);
      const duration = entering ? 1.35 : 1.15;
      const fraction = ease(action.elapsed / duration);
      const seated = entering ? fraction : exiting ? (1 - fraction) * (action.exitWeight ?? 1) : 1;
      const travel = entering ? ease(action.elapsed / 0.95) : exiting ? (1 - ease((action.elapsed - 0.3) / 0.85)) * (action.exitTravel ?? 1) : 1;
      action.poseWeight = seated;
      action.travelWeight = travel;
      world.player.position.set(
        THREE.MathUtils.lerp(action.approach.x, action.seat.x, travel),
        action.floor + (animator?.seatOffset(action.seatTop) || 0) * seated,
        THREE.MathUtils.lerp(action.approach.z, action.seat.z, travel),
      );
      world.player.rotation.y = action.rotation;
      animator?.play(entering ? 'SitDown' : exiting ? 'StandUp' : action.type === 'eat' ? 'Eat' : 'SitIdle', 0.12);
      animator?.update(delta, seated, action.seatTop);
      this.bathroom?.update(action.elapsed, seated, action.stage === 'active');
      if (action.type === 'toilet' && action.stage === 'standing') {
        const water = world.items.get(action.targetId)?.mesh.getObjectByName('ToiletWater');
        if (water) water.scale.setScalar(0.82 + Math.sin(action.elapsed * 18) * 0.12);
      }
      if (entering && action.elapsed >= duration) {
        action.stage = 'active'; action.elapsed = 0;
        if (action.type === 'eat') {
          const decor = world.items.get(action.targetId)?.mesh.getObjectByName('DiningDecor');
          if (decor) decor.visible = false;
          this.meal = createMeal(action.recipe);
          this.meal.group.position.set(action.food.x, action.floor + 0.889, action.food.z);
          this.meal.group.rotation.y = action.rotation;
          world.worldRoot.add(this.meal.group);
        }
        if (action.televisionId) world.items.get(action.televisionId)?.mesh.userData.screenPlayback?.setPlaying(true);
      } else if (action.stage === 'active') {
        action.progress = Math.min(1, action.elapsed / (action.type === 'eat' ? MEALS[action.recipe].duration : action.duration));
        this.meal?.update(action.progress);
        const phase = action.elapsed % 3.04 / 3.04;
        const bite = phase < 0.55 ? THREE.MathUtils.smoothstep(phase, 0.12, 0.43)
          : 1 - THREE.MathUtils.smoothstep(phase, 0.62, 0.95);
        if (animator && action.type === 'eat') {
          const plate = new THREE.Vector3(action.food.x, action.floor + 1.00, action.food.z);
          const target = plate.lerp(animator.point('Mouth'), bite);
          animator.reach(target);
          animator.showAccessory('fork', true);
          animator.showAccessory('bite', phase > 0.19 && phase < 0.57);
        }
        if (action.progress >= 1) {
          action.stage = 'standing'; action.elapsed = 0;
          animator?.showAccessory('fork', false); animator?.showAccessory('bite', false);
          animator?.play('StandUp', 0.1);
        }
      } else if (exiting && action.elapsed >= duration) {
        this.finish(action.stage === 'standing'); return;
      }
    }
    this.lastEmit += delta;
    if (this.lastEmit >= 0.2) { this.creditProgress(); this.emit(); this.lastEmit = 0; }
  }

  updateSleep(delta) {
    const { world } = this, action = this.current, animator = world.player.userData.controller;
    const sleeping=action.stage==='active';
    action.bedTime=action.bedExiting ? Math.max(0,(action.bedTime||0)-delta)
      : sleeping ? BED_TIMING.total : Math.min(BED_TIMING.total,(action.bedTime||0)+delta);
    const pose=bedPoseAt(action.bedTime,action,world.state.game.avatar.height,action.bedExiting);
    action.bedPose=pose;
    action.poseWeight=pose.recline;
    action.travelWeight=action.bedTime/BED_TIMING.total;
    const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2*pose.recline));
    animator?.play('Idle',0); animator?.update(delta); animator?.bedPose(pose);
    if(animator)animator.anchorHips(new THREE.Vector3(pose.hip.x,pose.hip.y,pose.hip.z),rotation);
    animator?.closeEyes(pose.recline);
    animator?.sleepWear(pose.legs>0.5);
    if (!this.cover && pose.cover>0) {
      this.cover = createSleepCover(action.bed.color,world.state.game.avatar.height);
      const position = localPoint(action.bed, action.side * 0.5, 0);
      this.cover.mesh.position.set(position.x, action.floor, position.z);
      this.cover.mesh.rotation.y = action.rotation;
      world.worldRoot.add(this.cover.mesh);
    }
    this.cover?.update(action.elapsed,pose.cover,pose.coverLift,action.side);
    if(action.bedExiting) {
      action.stage=pose.stage;
      if(action.bedTime===0)this.finish(!!action.completed);
    } else if(sleeping) {
      action.progress = Math.min(1, action.elapsed / action.duration);
      if(action.progress===1){action.bedExiting=true;action.completed=true;action.stage='bed-rise';}
    } else if(action.bedTime===BED_TIMING.total) {
      action.stage='active';action.elapsed=0;
    } else action.stage=pose.stage;
  }

  updateShower(delta) {
    const { world } = this, action = this.current, animator = world.player.userData.controller;
    const entering = action.stage === 'entering', exiting = ['standing', 'cancelling'].includes(action.stage);
    const fraction = ease(action.elapsed / 1.2);
    const weight = entering ? fraction : exiting ? (1 - fraction) * (action.exitWeight ?? 1) : 1;
    action.poseWeight = action.travelWeight = weight;
    world.player.position.set(
      THREE.MathUtils.lerp(action.approach.x, action.stand.x, weight),
      action.floor + 0.14 * weight,
      THREE.MathUtils.lerp(action.approach.z, action.stand.z, weight),
    );
    world.player.rotation.set(0, action.rotation, 0);
    animator?.play(entering || exiting ? 'Walk' : 'Idle');
    animator?.update(delta);
    if (!entering && !exiting) animator?.washPose(action.elapsed);
    this.bathroom?.update(action.elapsed, weight, action.stage === 'active');
    if (entering && action.elapsed >= 1.2) { action.stage = 'active'; action.elapsed = 0; }
    else if (action.stage === 'active') {
      action.progress = Math.min(1, action.elapsed / action.duration);
      if (action.progress === 1) { action.stage = 'standing'; action.elapsed = 0; }
    } else if (exiting && action.elapsed >= 1.2) this.finish(action.stage === 'standing');
  }

  updateHandwash(delta) {
    const {world}=this,action=this.current,animator=world.player.userData.controller;
    const entering=action.stage==='entering',exiting=['standing','cancelling'].includes(action.stage);
    const fraction=ease(action.elapsed/.9);
    const weight=entering?fraction:exiting?(1-fraction)*(action.exitWeight??1):1;
    action.poseWeight=action.travelWeight=weight;
    if(action.stage==='active')action.washTime=Math.min(action.elapsed,action.duration);
    const time=action.washTime||0;
    world.player.position.set(
      THREE.MathUtils.lerp(action.approach.x,action.stand.x,weight),action.floor,
      THREE.MathUtils.lerp(action.approach.z,action.stand.z,weight));
    world.player.rotation.set(0,action.rotation,0);
    animator?.play('Idle',0);animator?.update(delta);
    const targets=handwashTargets(time,action.fixture,action.floor);
    const hands=animator?.handwashPose(targets,time,weight);
    this.handwashing?.update(time,weight,hands);
    if(entering&&action.elapsed>=.9){action.stage='active';action.elapsed=0;}
    else if(action.stage==='active') {
      action.progress=Math.min(1,action.elapsed/action.duration);
      if(action.progress===1){action.stage='standing';action.elapsed=0;}
    } else if(exiting&&action.elapsed>=.9)this.finish(action.stage==='standing');
  }
}
