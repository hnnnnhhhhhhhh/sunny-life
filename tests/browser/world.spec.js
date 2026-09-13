import { test, expect } from '@playwright/test';
import { finishOnboarding,seedCoastalHome } from './helpers.js';

async function boot(page) {
  await seedCoastalHome(page);
  await page.goto('/');
  await expect(page.getByTestId('world-canvas')).toBeVisible();
  await expect(page.locator('.world-loading')).toHaveCount(0);
  await finishOnboarding(page);
  await page.waitForTimeout(900);
}

test('the reference-inspired world loads actual scenery and animated water', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  const initial = await page.evaluate(() => window.__sunny.diagnostics());
  expect(initial.assets.scenery.loaded).toHaveLength(10);
  expect(initial.assets.scenery.failed).toEqual({});
  expect(initial.environment.landmarks.every(item => item.source === 'blender')).toBe(true);
  await page.waitForTimeout(600);
  const next = await page.evaluate(() => window.__sunny.diagnostics());
  expect(next.environment.waterTime).toBeGreaterThan(initial.environment.waterTime);
  expect(next.environment.waterSamples).not.toEqual(initial.environment.waterSamples);
  await page.getByRole('button', { name: '建造', exact: true }).click();
  await page.getByRole('button', { name: '浏览青禾镇', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '小镇目的地' }).getByRole('button')).toHaveCount(5);
  await page.screenshot({ path: 'test-results/river-village-map.png' });
  await page.getByRole('button', { name: '街区全景', exact: true }).click();
  await page.getByRole('button', { name: '收起家具目录', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/river-village-overview.png' });
  expect(errors).toEqual([]);
});

test('map travel crosses bridges and climbs the village ramp without resetting the world', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '浏览青禾镇', exact: true }).click();
  await page.getByRole('button', { name: '前往溪畔营地', exact: true }).click();
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().position[2]), { timeout: 20000 }).toBeGreaterThan(19);
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().pathLength)).toBe(0);
  const camp = await page.evaluate(() => window.__sunny.diagnostics().position);
  expect(camp[0]).toBeCloseTo(-4, 1);
  expect(camp[1]).toBeCloseTo(0.14, 1);
  await page.screenshot({ path: 'test-results/river-village-camp.png' });
  await page.getByRole('button', { name: '浏览青禾镇', exact: true }).click();
  await page.getByRole('button', { name: '前往彩窗街', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().position[2]), { timeout: 20000 }).toBeLessThan(-13);
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().pathLength)).toBe(0);
  expect(await page.evaluate(() => window.__sunny.diagnostics().position[1])).toBeCloseTo(1.24, 1);
  await page.screenshot({ path: 'test-results/river-village-street.png' });
  expect(await page.evaluate(() => window.__sunny.state().game.home.furniture.length)).toBe(16);
});

test('water clicks stay blocked and mobile map navigation remains usable', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '生活', exact: true }).click();
  await page.waitForTimeout(900);
  const point = await page.evaluate(() => window.__sunny.project(-4, -1.05, 13.5));
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('status', { name: '游戏通知' })).toContainText('河面');
  expect(await page.evaluate(() => window.__sunny.diagnostics().pathLength)).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '浏览青禾镇', exact: true }).click();
  await page.getByRole('button', { name: '前往望星塔', exact: true }).click();
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().position[0]), { timeout: 20000 }).toBeLessThan(-13);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/river-village-tower-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
