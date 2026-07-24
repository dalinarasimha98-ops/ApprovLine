import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const storageState = process.env.E2E_STORAGE_STATE;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    storageState,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
