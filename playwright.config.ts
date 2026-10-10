import { defineConfig, devices } from '@playwright/test'

const PORT = 4174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Requests made by a service worker can't be intercepted in WebKit, so the
    // fake config API wouldn't see them. Tests that need the worker opt back in.
    serviceWorkers: 'block',
  },
  // Phone-sized, since that's how learners use the app.
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'webkit', use: { ...devices['iPhone 14'] } },
  ],
  // The production build, so the service worker and precache are the real ones.
  webServer: {
    command: `npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Always rebuild, so a test run never checks stale code.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
