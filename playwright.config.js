import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const cachedChromium = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const baseURL = process.env.SUNNY_TEST_URL || 'http://localhost:5186';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      ...(existsSync(cachedChromium) ? { executablePath: cachedChromium } : {}),
      args: ['--enable-webgl', '--ignore-gpu-blocklist', ...(process.env.CI ? ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] : [])],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${new URL(baseURL).port}`,
    url: baseURL,
    reuseExistingServer: true,
  },
});
