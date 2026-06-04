// playwright.config.js — Playwright test configuration

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir:    './tests',
  timeout:    30_000,
  retries:    0,
  reporter:   'list',
  use: {
    // Open datalab.html directly as a file:// URL — no server needed
    baseURL:          `file://${path.resolve(__dirname, 'datalab.html')}`,
    headless:         true,
    screenshot:       'only-on-failure',
    video:            'off',
  },
  projects: [
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
  ],
});
