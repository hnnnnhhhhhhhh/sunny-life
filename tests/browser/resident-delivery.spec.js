import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test.setTimeout(120000);
for(const mode of ['slow-gzip','native-fallback','http-gzip'])test(`resident delivery retains the real rig with ${mode}`,async({page})=>{
  const requested=[];
  page.on('request',r=>{if(r.url().includes('models/resident/'))requested.push(r.url());});
  if(mode==='slow-gzip')await page.route('**/models/resident/resident.glb.gz*',async route=>{
    await new Promise(resolve=>setTimeout(resolve,12000));await route.continue();
  });
  if(mode==='native-fallback')await page.addInitScript(()=>{globalThis.DecompressionStream=undefined;});
  if(mode==='http-gzip') {
    const bytes=await readFile(new URL('../../public/models/resident/resident.glb.gz',import.meta.url));
    await page.route('**/models/resident/resident.glb.gz*',route=>route.fulfill({
      status:200,contentType:'model/gltf-binary',headers:{'content-encoding':'gzip'},body:bytes,
    }));
  }
  await page.goto(process.env.CI?'/?quality=low':'/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.world-loading')).toHaveCount(0,{timeout:90000});
  const resident=await page.evaluate(()=>window.__sunny.diagnostics({pixels:false}).resident);
  expect(resident?.source).toBe('blender-resident');
  expect(resident?.bones).toBe(29);
  expect(requested.some(url=>url.includes('.glb.gz'))).toBe(mode!=='native-fallback');
});
