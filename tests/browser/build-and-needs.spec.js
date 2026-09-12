import { test, expect } from '@playwright/test';
import { newGame } from '../../src/game.js';
import { finishOnboarding } from './helpers.js';

async function boot(page, game) {
  if (game) await page.addInitScript(game => localStorage.setItem('sunny-life.save.v1', JSON.stringify(game)), game);
  await page.goto('/');
  await expect(page.locator('.world-loading')).toHaveCount(0);
  await finishOnboarding(page);
  await page.waitForTimeout(900);
}
const diagnostics = page => page.evaluate(() => window.__sunny.diagnostics());
const state = page => page.evaluate(() => window.__sunny.state().game);
async function point(page, x, y, z) {
  return page.evaluate(p => window.__sunny.project(...p), [x, y, z]);
}
async function clickWorld(page, x, y, z) {
  const p = await point(page, x, y, z);
  await page.mouse.click(p.x, p.y);
}
async function dragWorld(page, a, b) {
  const start = await point(page, a[0], 0.25, a[1]), end = await point(page, b[0], 0.25, b[1]);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 16 }); await page.mouse.up();
}
async function use(page, id, label) {
  const game = await state(page), fixture = game.home.furniture.find(f => f.id === id);
  await clickWorld(page, fixture.x, fixture.type === 'shower' ? 1.6 : 0.85, fixture.z);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect.poll(() => diagnostics(page).then(d => d.activity?.stage), { timeout: 20000 }).toBe('active');
}

test('a blank lot supports drag rooms, walls, doors, demolition and undo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await page.getByRole('button', { name: '建造', exact: true }).click();
  await page.getByRole('button', { name: '房屋属性', exact: true }).click();
  await page.getByRole('button', { name: '清空建筑与家具', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect((await state(page)).home.furniture).toHaveLength(16);
  await page.getByRole('button', { name: '清空建筑与家具', exact: true }).click();
  await page.getByRole('button', { name: '确认清空地块', exact: true }).click();
  await page.waitForTimeout(500);
  const camera = (await diagnostics(page)).camera.position;
  await dragWorld(page, [-4, -2], [2, 3]);
  expect((await state(page)).home.rooms).toHaveLength(1);
  expect((await state(page)).home.walls).toHaveLength(4);
  expect((await diagnostics(page)).camera.position).toEqual(camera);
  await page.getByRole('button', { name: '建造墙体', exact: true }).click();
  await dragWorld(page, [0, -2], [0, 3]);
  expect((await state(page)).home.walls).toHaveLength(5);
  await page.getByLabel('镜头设置', { exact: true }).click();
  await page.getByRole('button', { name: '自动剖墙', exact: true }).click();
  await page.getByLabel('镜头设置', { exact: true }).click();
  await page.getByRole('button', { name: '安装门洞', exact: true }).click();
  await clickWorld(page, 0, 1.6, 0.5);
  expect((await state(page)).home.walls.at(-1).kind).toBe('door');
  await page.getByRole('button', { name: '安装窗户', exact: true }).click();
  await clickWorld(page, -2, 1.6, -2);
  expect((await state(page)).home.walls.some(w => w.kind === 'window')).toBe(true);
  await page.screenshot({ path: 'test-results/drag-built-room.png' });
  await page.getByRole('button', { name: '拆除家具或墙体', exact: true }).click();
  await clickWorld(page, 0, 1.2, -1.5);
  expect((await state(page)).home.walls).toHaveLength(4);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await state(page)).home.walls).toHaveLength(5);
  expect(errors).toEqual([]);
});

test('original exterior walls can be removed and restored without resetting the home', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '建造', exact: true }).click();
  await page.getByRole('button', { name: '拆除家具或墙体', exact: true }).click();
  await page.waitForTimeout(500);
  await clickWorld(page, -0.6, 3.15, -4.5);
  expect((await state(page)).home.removedExterior).toContain('exterior-north');
  expect((await diagnostics(page)).walls.some(w => w.id === 'exterior-north')).toBe(false);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await diagnostics(page)).walls.some(w => w.id === 'exterior-north')).toBe(true);
});

test('toilet and shower run physical stages, pause, restore needs and clean up', async ({ page }) => {
  const game = newGame();
  game.sim.needs.bladder = 18; game.sim.needs.hygiene = 20; game.sim.autonomy = false;
  await boot(page, game);
  await use(page, 'toilet-1', '上厕所');
  let d = await diagnostics(page);
  expect(d.activity.seatId).toBe('toilet-1');
  expect(d.resident.hips[1]).toBeCloseTo(0.25 + 0.59 + 0.07, 1);
  expect(d.bathroom.visible).toBe(true);
  await page.screenshot({ path: 'test-results/toilet-privacy.png' });
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await expect.poll(() => diagnostics(page).then(d => d.activity), { timeout: 15000 }).toBeNull();
  expect((await state(page)).sim.needs.bladder).toBeGreaterThan(85);
  await page.getByRole('button', { name: '回到家园视角', exact: true }).click();
  await page.getByRole('button', { name: '1倍速', exact: true }).click();
  await page.waitForTimeout(900);
  await use(page, 'shower-1', '洗澡');
  d = await diagnostics(page);
  expect(d.position[0]).toBeCloseTo(-9.05, 2);
  expect(d.position[1]).toBeCloseTo(0.39, 2);
  expect(d.bathroom.drops).toBe(96);
  await page.waitForTimeout(450);
  expect((await diagnostics(page)).resident.hand).not.toEqual(d.resident.hand);
  await page.screenshot({ path: 'test-results/shower-running.png' });
  await page.getByRole('button', { name: '暂停生活', exact: true }).click();
  const paused = await diagnostics(page);
  await page.waitForTimeout(500);
  expect((await diagnostics(page)).bathroom.time).toBe(paused.bathroom.time);
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await expect.poll(() => diagnostics(page).then(d => d.activity), { timeout: 15000 }).toBeNull();
  expect((await state(page)).sim.needs.hygiene).toBeGreaterThan(80);
  expect((await diagnostics(page)).bathroom).toBeNull();
});

test('autonomy chooses reachable needs and yields to manual input without moving the camera', async ({ page }) => {
  const game = newGame();
  game.sim.needs.bladder = 10;
  await boot(page, game);
  const camera = (await diagnostics(page)).camera;
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await expect.poll(() => diagnostics(page).then(d => d.activity?.type), { timeout: 15000 }).toBe('toilet');
  expect((await diagnostics(page)).autonomy.active).toBe(true);
  expect((await diagnostics(page)).camera.position).toEqual(camera.position);
  await page.getByRole('button', { name: '取消当前活动', exact: true }).click();
  await page.getByRole('switch', { name: '自主照料', exact: true }).uncheck();
  await expect.poll(() => diagnostics(page).then(d => d.activity)).toBeNull();
  await page.waitForTimeout(2000);
  expect((await state(page)).sim.needs.bladder).toBeLessThan(10);
  expect((await diagnostics(page)).activity).toBeNull();
});

test('camera rotates both ways, tilts, switches projection and renders grass on mobile', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await boot(page);
  const initial = await diagnostics(page);
  expect(initial.environment.grass.style).toBe('low-poly');
  expect(initial.environment.grass.blades).toBeLessThan(1000);
  await page.getByRole('button', { name: '向左旋转视角', exact: true }).click();
  await page.waitForTimeout(900);
  expect((await diagnostics(page)).camera.azimuth).toBeLessThan(initial.camera.azimuth - 0.7);
  await page.getByRole('button', { name: '旋转视角', exact: true }).click();
  await page.waitForTimeout(900);
  expect((await diagnostics(page)).camera.azimuth).toBeCloseTo(initial.camera.azimuth, 2);
  await page.getByLabel('镜头设置', { exact: true }).click();
  await page.getByRole('button', { name: '降低视角', exact: true }).click();
  await page.waitForTimeout(900);
  expect((await diagnostics(page)).camera.polar).toBeGreaterThan(initial.camera.polar + 0.15);
  await page.getByRole('button', { name: '透视镜头', exact: true }).click();
  expect((await diagnostics(page)).camera.type).toBe('PerspectiveCamera');
  await page.getByLabel('镜头设置', { exact: true }).click();
  await page.screenshot({ path: 'test-results/meadow-perspective.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  const d = await diagnostics(page);
  expect(new Set(d.samples.map(p => p.join(','))).size).toBeGreaterThan(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/meadow-mobile.png' });
  expect(errors).toEqual([]);
});

test('mobile touch drags build a room and new floor is actually walkable', async ({ page }) => {
  const game = newGame();
  Object.assign(game.home, { foundation: false, furniture: [], rooms: [], walls: [] });
  game.sim.x = 0; game.sim.z = 5; game.sim.autonomy = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, game);
  await page.getByRole('button', { name: '建造', exact: true }).click();
  await page.getByRole('button', { name: '建造房间', exact: true }).click();
  await page.waitForTimeout(700);
  const start = await point(page, -3, 0.25, -1), end = await point(page, 3, 0.25, 3);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] });
  for (let i = 1; i <= 16; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * i / 16, y: start.y + (end.y - start.y) * i / 16 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await state(page)).home.rooms).toHaveLength(1);
  await page.getByRole('button', { name: '生活', exact: true }).click();
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await page.waitForTimeout(900);
  await clickWorld(page, 0, 0.25, 0);
  await expect.poll(() => diagnostics(page).then(d => d.position[2]), { timeout: 15000 }).toBeCloseTo(0, 1);
  expect((await diagnostics(page)).position[1]).toBeCloseTo(0.25, 1);
  await page.screenshot({ path: 'test-results/touch-built-room.png' });
});

test('old save migration preserves the home and supports adding a bathroom', async ({ page }) => {
  const old = newGame();
  old.home.furniture = old.home.furniture.filter(f => !['toilet', 'shower'].includes(f.type));
  old.home.walls = old.home.walls.filter(w => !w.roomId);
  delete old.home.rooms; delete old.home.foundation; delete old.home.exteriorEdits; delete old.home.removedExterior;
  delete old.sim.needs.bladder; delete old.sim.needs.hygiene; delete old.sim.autonomy;
  old.avatar.name = '旧存档居民';
  await boot(page, old);
  const restored = await state(page);
  expect(restored.home.furniture).toEqual(old.home.furniture);
  expect(restored.sim.needs.hygiene).toBeGreaterThan(80);
  await page.getByRole('button', { name: '建造', exact: true }).click();
  await page.getByRole('button', { name: '房屋属性', exact: true }).click();
  await page.getByRole('button', { name: '添加卫浴间', exact: true }).click();
  expect((await state(page)).home.rooms[0].id).toBe('bathroom');
  expect((await state(page)).avatar.name).toBe(old.avatar.name);
});
