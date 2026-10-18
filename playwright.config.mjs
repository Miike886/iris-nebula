import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:5174',channel:'msedge',headless:true,viewport:{width:1440,height:900}},
  webServer:{command:'node scripts/serve.mjs --port 5174',url:'http://127.0.0.1:5174',reuseExistingServer:false},
  reporter:'list'
});
