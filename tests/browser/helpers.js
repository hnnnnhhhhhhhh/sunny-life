import { expect } from '@playwright/test';
import {newGame} from '../../src/game.js';

export async function seedCoastalHome(page) {
  await page.addInitScript(game=>{
    if(!localStorage.getItem('sunny-life.save.v1'))localStorage.setItem('sunny-life.save.v1',JSON.stringify(game));
  },newGame());
}

export async function finishOnboarding(page) {
  await expect(page.locator('.world-loading')).toHaveCount(0);
  const start = page.getByRole('button', { name:'开始生活', exact:true });
  if (await start.isVisible()) {
    await page.getByRole('textbox', { name:'居民姓名', exact:true }).fill('林小满');
    await start.click();
    await expect(page.getByRole('button', { name:'生活', exact:true })).toBeVisible();
    await page.waitForTimeout(800);
  }
}
