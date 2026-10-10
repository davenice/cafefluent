import { test, expect } from '@playwright/test'
import { FakeConfigApi } from './fakeConfigApi'

// Needs the real service worker. Only Chromium lets Playwright intercept the
// worker's own requests, which is how the fake config API answers them.
test.use({ serviceWorkers: 'allow' })
test.skip(({ browserName }) => browserName !== 'chromium', 'service worker requests are only routable in Chromium')

test('uses the last known config when offline', async ({ page, context }) => {
  const api = new FakeConfigApi({ enabledModules: ['bread'] })
  await api.install(context)

  await page.goto('/')
  // clientsClaim: the worker takes control of this first page once it activates.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  // Now the config request goes through the worker, which caches the response.
  await page.reload()
  await expect(page.getByRole('link', { name: /^Bread/ })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open('module-config')
    return (await cache.keys()).length
  })).toBe(1)

  api.mode = 'offline'
  await context.setOffline(true)
  await page.reload()

  // The cached config, not the "show everything" fallback.
  await expect(page.getByRole('link', { name: /^Bread/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Allergens/ })).toHaveCount(0)
})
