import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.CVITAE_PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './e2e',
  // PDF.js/canvas output is intentionally compared across CI platforms. A
  // shared path plus a small pixel tolerance catches layout regressions without
  // requiring one baseline per operating system.
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL,
    acceptDownloads: true,
    trace: 'retain-on-failure'
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'pnpm dev --port 3100',
        url: 'http://127.0.0.1:3100/en',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
