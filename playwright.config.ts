import { defineConfig } from '@playwright/test';

// When E2E_BASE_URL is set, tests run against that server (real dev or staging).
// Otherwise, a self-contained fixture server starts on port 4321 — no DB or Clerk needed.
const FIXTURE_SERVER_URL = 'http://127.0.0.1:4321';
const baseURL = process.env.E2E_BASE_URL ?? FIXTURE_SERVER_URL;
const storageState = process.env.E2E_STORAGE_STATE;
const useFixtureServer = !process.env.E2E_BASE_URL;

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
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium',
    },
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: useFixtureServer ? 'node tests/e2e/fixture-server.mjs' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: useFixtureServer ? 15_000 : 120_000,
  },
});
