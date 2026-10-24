import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: process.env.CI ? undefined : 'msedge',
    trace: 'on-first-retry',
    ...devices['Pixel 7']
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      VITE_API_URL: '/api/v1',
      VITE_FIREBASE_API_KEY: 'e2e-public-placeholder',
      VITE_FIREBASE_AUTH_DOMAIN: 'e2e.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'guardify-e2e',
      VITE_FIREBASE_APP_ID: '1:1:web:e2e',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '1'
    }
  }
});
