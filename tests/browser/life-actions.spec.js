import { test, expect } from '@playwright/test';
import { finishOnboarding,seedCoastalHome } from './helpers.js';

async function boot(page) {
  await seedCoastalHome(page);
  await page.goto('/');
  await expect(page.getByTestId('world-canvas')).toBeVisible();
  await expect(page.locator('.world-loading')).toHaveCount(0);
  await finishOnboarding(page);
  await page.waitForTimeout(700);
}

async function useFurniture(page, id, label, height) {
  const point = await page.evaluate(({ id, height }) => {
    const item = window.__sunny.state().game.home.furniture.find(f => f.id === id);
    return window.__sunny.project(item.x, height, item.z);
  }, { id, height });
  await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().activity?.stage), { timeout: 20000 }).toBe('active');
}

test('compact HUD uses corners and one bottom-centre clock without masking the world', async ({ page }) => {
  await boot(page);
  const measure = () => page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom };
    };
    const selectors = ['.game-header','.mode-switch','.resident-panel','.time-controls','.camera-controls','.location-label'];
    return { width:innerWidth, height:innerHeight, elements:selectors.map(rect), header:rect('.game-header'), modes:rect('.mode-switch'), resident:rect('.resident-panel'), clock:rect('.time-controls') };
  });
  const desktop = await measure();
  expect(desktop.header.width).toBeLessThan(400);
  expect(desktop.header.right).toBeLessThan(desktop.modes.x);
  expect(desktop.resident.x).toBeGreaterThan(1100);
  expect(desktop.resident.bottom).toBeGreaterThan(970);
  expect(desktop.clock.x + desktop.clock.width / 2).toBeCloseTo(720, 0);
  expect(desktop.elements.reduce((sum, r) => sum + r.width * r.height, 0) / (1440 * 1000)).toBeLessThan(0.13);
  await page.screenshot({ path: 'test-results/compact-hud-desktop.png' });
  await page.getByRole('tab', { name: '特质', exact: true }).click();
  await expect(page.getByText('热爱自然', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '收起居民面板', exact: true }).click();
  await expect(page.locator('.resident-panel-content')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await measure();
  expect(mobile.header.right).toBeLessThan(mobile.modes.x);
  expect(mobile.resident.bottom).toBeLessThan(mobile.clock.y);
  expect(mobile.elements.reduce((sum, r) => sum + r.width * r.height, 0) / (390 * 844)).toBeLessThan(0.22);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/compact-hud-mobile.png' });
});

test('chat holds the neighbour in place, turns both residents, and releases on cancel', async ({ page }) => {
  await boot(page);
  await page.getByRole('tab', { name: '邻居', exact: true }).click();
  await page.getByRole('button', { name: '与江宁聊天', exact: true }).click();
  const held = await page.evaluate(() => window.__sunny.diagnostics().neighbors[0]);
  expect(held.busy).toBe(true);
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().activity?.stage), { timeout: 20000 }).toBe('active');
  await expect(page.getByRole('dialog',{name:'邻里日常'})).toBeVisible();
  await page.getByRole('dialog',{name:'邻里日常'}).getByRole('button',{name:'关闭',exact:true}).click();
  await page.waitForTimeout(700);
  const active = await page.evaluate(() => window.__sunny.diagnostics());
  expect(active.neighbors[0].position).toEqual(held.position);
  expect(['Talk','Listen']).toContain(active.neighbors[0].clip);
  expect(['Talk','Listen']).toContain(active.resident.clip);
  const dx = active.position[0] - held.position[0], dz = active.position[2] - held.position[2];
  expect(Math.sin(active.neighbors[0].rotation) * dx + Math.cos(active.neighbors[0].rotation) * dz).toBeGreaterThan(0.8);
  await page.screenshot({ path: 'test-results/neighbour-conversation.png' });
  await page.getByRole('button', { name: '取消当前活动', exact: true }).click();
  expect(await page.evaluate(() => window.__sunny.diagnostics().neighbors[0].busy)).toBe(false);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__sunny.diagnostics().neighbors[0].position[0])).not.toBeCloseTo(held.position[0], 2);
});

test('sofa rest puts hips on the cushion and exits the sofa on cancel', async ({ page }) => {
  await boot(page);
  await useFurniture(page, 'sofa-1', '坐下休息', 0.9);
  const state = await page.evaluate(() => window.__sunny.diagnostics());
  expect(state.activity.seatId).toBe('sofa-1');
  expect(state.resident.clip).toBe('SitIdle');
  expect(state.position[0]).toBeCloseTo(state.activity.seat.x, 2);
  expect(state.position[2]).toBeCloseTo(state.activity.seat.z, 2);
  expect(state.resident.hips[1]).toBeCloseTo(0.25 + 0.68 + 0.07, 1);
  await page.screenshot({ path: 'test-results/sofa-resting.png' });
  await page.getByRole('button', { name: '取消当前活动', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().activity)).toBeNull();
  expect(await page.evaluate(() => window.__sunny.diagnostics().resident.clip)).toBe('Idle');
});

test('sleep lies within the bed with head on the pillow and a blanket, then gets out', async ({ page }) => {
  await boot(page);
  await useFurniture(page, 'bed-1', '睡个好觉', 1.1);
  const state = await page.evaluate(() => window.__sunny.diagnostics());
  expect(state.coverVisible).toBe(true);
  expect(Math.abs(state.postureUp[1])).toBeLessThan(0.02);
  expect(Math.abs(state.resident.mouth[0] - state.activity.pillow.x)).toBeLessThan(0.15);
  expect(Math.abs(state.resident.mouth[2] - state.activity.pillow.z)).toBeLessThan(0.16);
  await page.screenshot({ path: 'test-results/sleep-under-blanket.png' });
  await page.getByRole('button', { name: '暂停生活', exact: true }).click();
  const progress = state.activity.progress;
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__sunny.diagnostics().activity.progress)).toBeCloseTo(progress, 1);
  await page.getByRole('button', { name: '取消当前活动', exact: true }).click();
  await page.getByRole('button', { name: '3倍速', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().activity), { timeout: 15000 }).toBeNull();
  expect(await page.evaluate(() => window.__sunny.diagnostics().coverVisible)).toBe(false);
  expect(await page.evaluate(() => window.__sunny.diagnostics().postureUp[1])).toBeCloseTo(1);
});

test('watching TV uses a facing seat and really changes the display pixels', async ({ page }) => {
  await boot(page);
  const before = await page.evaluate(() => window.__sunny.diagnostics().televisions[0]);
  expect(before.playing).toBe(false);
  await useFurniture(page, 'tv-1', '自然纪录片', 1.5);
  const a = await page.evaluate(() => window.__sunny.diagnostics());
  expect(a.activity.seatId).toBe('sofa-1');
  expect(a.televisions[0].playing).toBe(true);
  await page.waitForTimeout(650);
  const b = await page.evaluate(() => window.__sunny.diagnostics().televisions[0]);
  expect(b.checksum).not.toBe(a.televisions[0].checksum);
  expect(b.screenPixels.reduce((sum, pixel) => sum + pixel[0] + pixel[1] + pixel[2], 0) / 9).toBeGreaterThan(110);
  await page.screenshot({ path: 'test-results/television-playing.png' });
  await page.getByRole('button', { name: '暂停生活', exact: true }).click();
  const paused = await page.evaluate(() => window.__sunny.diagnostics().televisions[0]);
  await page.waitForTimeout(400);
  expect((await page.evaluate(() => window.__sunny.diagnostics().televisions[0])).checksum).toBe(paused.checksum);
  await page.getByRole('button', { name: '继续生活', exact: true }).click();
  await page.getByRole('button', { name: '取消当前活动', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sunny.diagnostics().activity)).toBeNull();
  expect((await page.evaluate(() => window.__sunny.diagnostics().televisions[0])).playing).toBe(false);
});
