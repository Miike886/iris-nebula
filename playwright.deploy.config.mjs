import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

export default defineConfig({
  ...base,
  testMatch: 'deployment.spec.mjs',
  webServer: {
    command: 'node scripts/serve.mjs --production --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false
  }
});
