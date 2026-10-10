import { test as base, type Page } from '@playwright/test'
import { MODULES, DESCRIBE_GAME } from '../src/data/modules'
import { FakeConfigApi } from './fakeConfigApi'

export { expect } from '@playwright/test'

export const ALL_ENABLED = [...MODULES.map(m => m.id), DESCRIBE_GAME.id]

declare global {
  interface Window { __audioSrcs: string[] }
}

/**
 * `test` with two things set up for every test:
 * - `api`: the fake config API, with every module enabled. Change `api.state` to
 *   test something else.
 * - a record of every `new Audio(src)` the page makes, read with `audioSrcs()`.
 *   Headless browsers may never fetch or play the sound, so this is how tests
 *   know which file the app asked for.
 */
export const test = base.extend<{ api: FakeConfigApi }>({
  api: [async ({ context }, use) => {
    await context.addInitScript(() => {
      const RealAudio = window.Audio
      window.__audioSrcs = []
      window.Audio = function (src?: string) {
        if (src) window.__audioSrcs.push(new URL(src, location.href).pathname)
        return new RealAudio(src)
      } as unknown as typeof Audio
    })
    const api = new FakeConfigApi({ enabledModules: ALL_ENABLED })
    await api.install(context)
    await use(api)
  }, { auto: true }],
})

/**
 * Stops time in the page, so timers only fire when the test moves the clock on
 * with `page.clock.runFor`. Call before the page loads.
 */
export async function pauseClock(page: Page) {
  const start = new Date('2026-01-05T10:00:00')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
}

/** Paths of the audio files the page has created, oldest first. */
export function audioSrcs(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__audioSrcs)
}
