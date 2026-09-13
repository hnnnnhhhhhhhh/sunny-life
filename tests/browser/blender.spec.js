import { test, expect } from '@playwright/test';
import { finishOnboarding,seedCoastalHome } from './helpers.js';

async function boot(page) {
  await seedCoastalHome(page);
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('world-canvas')).toBeVisible();
  await expect(page.locator('.world-loading')).toHaveCount(0);
  await finishOnboarding(page);
  await page.waitForTimeout(850);
  await page.getByRole('button', { name: '建造', exact: true }).click();
}

test('all six Blender assets are used in the game and remain independently editable', async ({ page }) => {
  await boot(page);
  const initial = await page.evaluate(() => window.__sunny.diagnostics());
  expect(initial.assets.loaded.sort()).toEqual(['bed', 'chair', 'coffee', 'lamp', 'plant', 'sofa']);
  expect(initial.assets.failed).toEqual({});
  expect(initial.furniture.filter(f => f.source === 'blender')).toHaveLength(6);
  await page.getByRole('button', { name: '放置拥抱休闲椅' }).click();
  expect(await page.evaluate(() => window.__sunny.diagnostics().previewSource)).toBe('blender');
  const point = await page.evaluate(() => window.__sunny.project(-3.5, 0.25, 6));
  await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: '家具配色 2', exact: true }).click();
  const colored = await page.evaluate(() => window.__sunny.diagnostics().furniture);
  expect(colored.find(f => f.id === 'chair-1').dyes).toEqual(['d3987c']);
  expect(colored.at(-1).dyes).toEqual(['bdc397']);
  expect(colored.at(-1).source).toBe('blender');
  await page.getByRole('button', { name: '旋转', exact: true }).click();
  await page.getByRole('button', { name: '收回', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  const restored = await page.evaluate(() => window.__sunny.diagnostics().furniture.at(-1));
  expect(restored.source).toBe('blender');
  expect(restored.dyes).toEqual(['bdc397']);
  await page.screenshot({ path: 'test-results/blender-desktop.png' });
  await page.getByRole('button', { name: '放大视角', exact: true }).click();
  await page.getByRole('button', { name: '放大视角', exact: true }).click();
  await page.screenshot({ path: 'test-results/blender-detail.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '回到家园视角', exact: true }).click();
  await page.waitForTimeout(850);
  const mobile = await page.evaluate(() => window.__sunny.diagnostics());
  expect(mobile.assets.loaded).toHaveLength(6);
  expect(new Set(mobile.samples.map(pixel => pixel.join(','))).size).toBeGreaterThan(3);
  await page.screenshot({ path: 'test-results/blender-mobile.png' });
});

test('an unavailable GLB falls back without preventing editing or corrupting saves', async ({ page }) => {
  await page.route('**/models/blender/sofa.glb?*', route => route.abort());
  await boot(page);
  const status = await page.evaluate(() => window.__sunny.diagnostics());
  expect(status.assets.failed.sofa).toBeTruthy();
  expect(status.assets.loaded).toHaveLength(5);
  expect(status.furniture.find(f => f.id === 'sofa-1').source).toBe('procedural');
  expect(status.furniture.find(f => f.id === 'bed-1').source).toBe('blender');
  await page.getByRole('button', { name: '放置云朵三人沙发' }).click();
  const point = await page.evaluate(() => window.__sunny.project(-3.5, 0.25, 6));
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => window.__sunny.state().game.home.furniture.length)).toBe(17);
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sunny-life.save.v1')).home.furniture.length)).toBe(17);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sunny-life.save.v1')));
  expect(saved.home.furniture).toHaveLength(17);
  expect(saved.home.furniture.at(-1).type).toBe('sofa');
});
