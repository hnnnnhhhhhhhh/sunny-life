import { test, expect } from '@playwright/test';
import { newGame } from '../../src/game.js';

const diag = page => page.evaluate(() => window.__sunny.diagnostics({ pixels:false }));
async function boot(page, game) {
  await page.addInitScript(game => localStorage.setItem('sunny-life.save.v1', JSON.stringify(game)), game);
  await page.goto('/');
  await expect(page.locator('.world-loading')).toHaveCount(0);
  await page.waitForTimeout(900);
}
async function useShower(page) {
  const p = await page.evaluate(() => window.__sunny.project(-9.05, 1.6, -0.95));
  await page.mouse.click(p.x, p.y);
  await page.getByRole('button', { name: '洗澡', exact: true }).click();
  await expect.poll(() => diag(page).then(d => d.activity?.stage), { timeout: 15000 }).toBe('active');
}

test('unattended residents complete all six needs through real activities', async ({ page }) => {
  test.setTimeout(120000);
  const game = newGame();
  Object.assign(game.sim.needs, { bladder: 7, hygiene: 10, hunger: 20, energy: 15, fun: 20, social: 20 });
  await boot(page, game);
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  const observed = new Set();
  await expect.poll(async () => {
    const d = await diag(page);
    if (d.activity) observed.add(d.activity.type);
    return page.evaluate(() => Object.values(window.__sunny.state().game.sim.needs).every(value => value > 30));
  }, { timeout: 105000, intervals: [500] }).toBe(true);
  for (const type of ['toilet', 'shower', 'eat', 'sleep', 'chat']) expect(observed.has(type)).toBe(true);
  expect(['watch', 'read', 'garden'].some(type => observed.has(type))).toBe(true);
  await page.screenshot({ path: 'test-results/autonomous-needs-recovered.png' });
});

test('no fixtures means no fictitious need recovery or repeated notifications', async ({ page }) => {
  const game = newGame();
  game.home.furniture = [];
  game.sim.needs.bladder = 5;
  await boot(page, game);
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await expect.poll(() => diag(page).then(d => d.autonomy.blocked), { timeout: 12000 }).toBe(true);
  await page.waitForTimeout(1500);
  expect((await diag(page)).activity).toBeNull();
  expect(await page.evaluate(() => window.__sunny.state().game.sim.needs.bladder)).toBeLessThan(5);
  await expect(page.getByRole('status', { name: '游戏通知' })).toHaveCount(0);
});

test('shower cancellation and furniture deletion clear water, screen and pose', async ({ page }) => {
  const game = newGame();
  game.sim.autonomy = false; game.sim.needs.hygiene = 15;
  await boot(page, game);
  await useShower(page);
  await page.getByRole('button', { name: '暂停生活', exact: true }).click();
  const previous = await page.evaluate(() => window.__sunny.state().game.sim.needs.hygiene);
  expect((await diag(page)).walls.find(w => w.id === 'exterior-west').full).toBe(false);
  await page.getByRole('button', { name: '取消当前活动', exact: true }).click();
  await page.getByRole('button', { name: '继续生活', exact: true }).click();
  await expect.poll(() => diag(page).then(d => d.activity)).toBeNull();
  expect((await diag(page)).bathroom).toBeNull();
  expect(await page.evaluate(() => window.__sunny.state().game.sim.needs.hygiene)).toBeLessThan(previous + 1);
  await page.getByRole('button', { name: '回到家园视角', exact: true }).click();
  await page.waitForTimeout(900);
  await useShower(page);
  await page.getByRole('button', { name: '建造', exact: true }).click();
  expect((await diag(page)).bathroom).toBeNull();
  await page.waitForTimeout(900);
  const p = await page.evaluate(() => window.__sunny.project(-9.05, 1.6, -0.95));
  await page.mouse.click(p.x, p.y);
  await page.getByRole('button', { name: '收回', exact: true }).click();
  expect(await page.evaluate(() => window.__sunny.state().game.home.furniture.some(f => f.id === 'shower-1'))).toBe(false);
  expect((await diag(page)).resident.clip).toBe('Idle');
});

test('short and broad residents sit clear of the sofa back with grounded feet', async ({ page }) => {
  const game = newGame();
  Object.assign(game.avatar, { height: 0.85, build: 1.3, hair: 'short', base: 'male' });
  game.sim.autonomy = false;
  await boot(page, game);
  const p = await page.evaluate(() => window.__sunny.project(-3.1, 0.9, -2.75));
  await page.mouse.click(p.x, p.y);
  await page.getByRole('button', { name: '坐下休息', exact: true }).click();
  await expect.poll(() => diag(page).then(d => d.activity?.stage), { timeout: 15000 }).toBe('active');
  const d = await diag(page);
  for (const foot of d.resident.feet) expect(Math.abs(foot[1] - (0.25 + 0.09 * 0.85))).toBeLessThan(0.05);
  expect(d.resident.hips[2]).toBeGreaterThan(-2.75 + 0.1);
  await page.screenshot({ path: 'test-results/broad-resident-seated.png' });
  await page.getByRole('button', { name: '角色', exact: true }).click();
  await page.getByRole('button', { name: '面部特写', exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/neck-shoulders-male.png' });
});
