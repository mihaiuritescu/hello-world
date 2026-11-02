import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the production build, served by the real server on its own
// port and database, so they never touch development data.
const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // One database for the whole run: tests run one at a time.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'en-GB',
    timezoneId: 'Europe/Bucharest',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // A WebKit smoke run catches Safari-only issues, such as CSP behaviour on plain HTTP.
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@smoke/ },
  ],
  webServer: {
    command: 'vite build && node src/server/migrate.ts && node src/server/main.ts',
    url: `${BASE_URL}/readyz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      DB_NAME: 'hello_world_e2e',
      LOG_LEVEL: 'warn',
      // Every test is a new visitor from the same address, so the run would soon meet the
      // per-address limits. The integration tests cover the limits themselves.
      RATE_LIMIT_API_PER_MINUTE: '100000',
      RATE_LIMIT_ROOMS_PER_MINUTE: '100000',
      RATE_LIMIT_MESSAGES_PER_MINUTE: '100000',
    },
  },
})
