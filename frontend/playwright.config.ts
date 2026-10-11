import { defineConfig, devices } from '@playwright/test'
const production = process.env.TEST_PRODUCTION === '1'
export default defineConfig({
  testDir: './tests/browser', workers: 2,
  use: { ...(production ? { httpCredentials: { username: 'canvas', password: 'browser-fixture-password-only' } } : {}), baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  projects: [{ name: 'desktop', use: devices['Desktop Chrome'] }, { name: 'phone', use: devices['Pixel 7'] }],
  webServer: { command: production ? 'node dist-server/index.js' : 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort', env: production ? { NODE_ENV: 'production', CANVAS_ACCESS_PASSWORD: 'browser-fixture-password-only', CANVAS_STATE_DIR: '/tmp/canvas-browser-state', HOST: '127.0.0.1', PORT: '5173' } : {}, url: 'http://127.0.0.1:5173', reuseExistingServer: !production && !process.env.CI },
})
