import { test, expect } from '@playwright/test';
import { finishOnboarding } from './helpers.js';

async function boot(page) {
  await page.goto('/');
  await expect(page.getByTestId('world-canvas')).toBeVisible();
  await expect(page.locator('.world-loading')).toHaveCount(0);
  await finishOnboarding(page);
  await page.getByRole('button', { name: '生活', exact: true }).click();
  await page.waitForTimeout(900);
}

async function order(page, recipe = '枫糖松饼') {
  const p = await page.evaluate(() => window.__sunny.project(3.2, 1.1, -1.4));
  await page.mouse.click(p.x, p.y);
  await page.getByRole('button', { name: recipe, exact: true }).click();
  await page.getByRole('button', { name: /^开始用餐/ }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().activity?.stage), { timeout: 20000 }).toBe('active');
}

test('resident proportions, outfits and window alignment are rendered correctly', async ({ page }) => {
  await boot(page);
  const windows = await page.evaluate(() => window.__sunny.diagnostics().windows);
  expect(windows).toHaveLength(2);
  for (const win of windows) {
    expect(win.bottom).toBeCloseTo(1.11);
    expect(win.top).toBeCloseTo(2.9);
    expect(win.glass[1]).toBeCloseTo((win.bottom + win.top) / 2);
  }
  await page.getByRole('button', { name: '角色', exact: true }).click();
  await page.getByRole('tab', { name: '穿搭', exact: true }).click();
  await page.getByRole('button', { name: '休闲衬衫', exact: true }).click();
  await page.getByRole('button', { name: '上衣颜色 4', exact: true }).click();
  await page.getByRole('switch', { name: '圆框眼镜' }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/adult-resident-outfit.png' });
  await page.getByRole('button', { name: '面部特写', exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/adult-resident-face.png' });
  await page.getByRole('button', { name: '完成形象', exact: true }).click();
  expect(await page.evaluate(() => window.__sunny.state().game.avatar.outfit)).toBe('shirt');
});

test('eating moves a rigged hand to the food and mouth, pauses, and ends standing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  await order(page);
  const initial = await page.evaluate(() => window.__sunny.diagnostics());
  expect(initial.resident.bones).toBe(25);
  expect(initial.mealVisible).toBe(true);
  await page.waitForTimeout(1100);
  const moving = await page.evaluate(() => window.__sunny.diagnostics());
  expect(moving.resident.fork).not.toEqual(initial.resident.fork);
  expect(moving.resident.targetDistance).toBeLessThan(0.09);
  await page.screenshot({ path: 'test-results/dining-eating.png' });
  await page.getByRole('button', { name: '暂停生活', exact: true }).click();
  const paused = await page.evaluate(() => window.__sunny.diagnostics());
  await page.waitForTimeout(500);
  const still = await page.evaluate(() => window.__sunny.diagnostics());
  expect(still.activity.progress).toBeCloseTo(paused.activity.progress, 4);
  for (let i = 0; i < 3; i++) expect(still.resident.fork[i]).toBeCloseTo(paused.resident.fork[i], 3);
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().activity), { timeout: 15000 }).toBeNull();
  expect(await page.evaluate(() => window.__sunny.state().game.sim.needs.hunger)).toBeGreaterThan(95);
  expect(await page.evaluate(() => window.__sunny.diagnostics().mealVisible)).toBe(false);
  await page.screenshot({ path: 'test-results/dining-finished.png' });
  expect(errors).toEqual([]);
});

test('cancelling a meal clears props and retains only earned food, including on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await order(page, '田园沙拉');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/dining-mobile.png' });
  const hunger = await page.evaluate(() => window.__sunny.state().game.sim.needs.hunger);
  await page.getByRole('button', { name: '取消当前活动', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().activity)).toBeNull();
  expect(await page.evaluate(() => window.__sunny.diagnostics().mealVisible)).toBe(false);
  expect(await page.evaluate(() => window.__sunny.state().game.sim.needs.hunger)).toBeLessThan(hunger + 1);
  await page.getByRole('button', { name: '建造', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('body-height changes keep seated feet grounded and editing interrupts safely', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '角色', exact: true }).click();
  await page.getByRole('slider', { name: '身高', exact: true }).focus();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: '完成形象', exact: true }).click();
  await page.waitForTimeout(900);
  await order(page);
  await page.waitForTimeout(1300);
  const pose = await page.evaluate(() => window.__sunny.diagnostics().resident);
  expect(pose.height).toBeCloseTo(1.15);
  for (const foot of pose.feet) expect(Math.abs(foot[1] - (0.25 + 0.09 * pose.height))).toBeLessThan(0.045);
  await page.waitForTimeout(900);
  const later = await page.evaluate(() => window.__sunny.diagnostics().resident);
  for (let i = 0; i < 2; i++) expect(later.feet[i][1]).toBeCloseTo(pose.feet[i][1], 2);
  await page.getByRole('button', { name: '建造', exact: true }).click();
  expect(await page.evaluate(() => window.__sunny.diagnostics().activity)).toBeNull();
  expect(await page.evaluate(() => window.__sunny.diagnostics().mealVisible)).toBe(false);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__sunny.diagnostics().resident.clip)).toBe('Idle');
});
