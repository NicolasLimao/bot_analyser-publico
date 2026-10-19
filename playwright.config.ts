import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'node src/server.ts',
      url: 'http://127.0.0.1:3001/api/bootstrap',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node tests/e2e/live-server.ts',
      url: 'http://127.0.0.1:3002/api/bootstrap',
      reuseExistingServer: false,
    },
  ],
});
