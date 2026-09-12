import { ACTIVITIES, ITEM_MAP } from './game.js';
import { planActivity, planChat } from './interactions.js';

const THRESHOLDS = { hunger: 48, energy: 38, bladder: 45, hygiene: 40, social: 35, fun: 35 };
const PRIORITIES = { hunger: 1.2, energy: 1.1, bladder: 1.5, hygiene: 1, social: 0.7, fun: 0.65 };

export function autonomousCandidates(game, from, grid, neighbors = []) {
  const candidates = [];
  for (const object of game.home.furniture) {
    const type = ITEM_MAP[object.type].activity, definition = ACTIVITIES[type];
    if (!definition || game.sim.needs[definition.need] >= THRESHOLDS[definition.need]) continue;
    const plan = planActivity(game.home, object, from, grid, game.avatar.height);
    if (plan.error) continue;
    candidates.push({ id: object.id, type, plan, score: (100 - game.sim.needs[definition.need]) * PRIORITIES[definition.need] +
      Math.min(definition.amount, 100 - game.sim.needs[definition.need]) * 0.15 - plan.distance * 0.5 });
  }
  if (game.sim.needs.social < THRESHOLDS.social) for (const npc of neighbors.filter(n => !n.busy)) {
    const plan = planChat(game.home, npc.mesh.position, from, grid);
    if (!plan.error) candidates.push({ id: npc.id, type: 'chat', plan, score: (100 - game.sim.needs.social) * PRIORITIES.social - plan.distance * 0.5 });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export class Autonomy {
  constructor(world) {
    this.world = world;
    this.cooldown = 6;
    this.blocked = false;
  }

  manual() {
    this.cooldown = 12;
    this.blocked = false;
  }

  update(delta) {
    const { world } = this, { game, mode, speed } = world.state;
    if (mode !== 'live' || !speed || !game.sim.autonomy) return;
    if (world.activities.current || world.path.length || world.queue.items.length) { this.cooldown = Math.max(this.cooldown, 4); return; }
    this.cooldown -= delta;
    if (this.cooldown > 0) return;
    const candidate = autonomousCandidates(game, world.player.position, world.navGrid, world.npcs)[0];
    this.cooldown = candidate ? 4 : 15;
    this.blocked = !candidate && Object.entries(THRESHOLDS).some(([key, threshold]) => game.sim.needs[key] < threshold);
    if (!candidate) return;
    const options = { autonomous: true, plan: candidate.plan };
    if (candidate.type === 'chat') world.activities.startChat(candidate.id, options);
    else world.activities.start(candidate.id, 'pancakes', options);
  }
}
