import { test, expect, audioSrcs, pauseClock } from './fixtures'
import { FakeConfigApi } from './fakeConfigApi'
import { ALL_TASKS, completeQuiz, questionCount, waitForQuiz } from './helpers/quiz'

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

/**
 * The point of precaching every module's content: a learner on a bus with no
 * signal can still do a quiz, pictures, sounds and all. The quiz is answered
 * from the audio the page asks for, so a right answer means the sound the
 * worker served was the one for the question.
 */
test('a quiz with pictures and sound can be done with no connection', async ({ page, context }) => {
  const api = new FakeConfigApi({ enabledModules: ['bread'] })
  await api.install(context)
  await pauseClock(page)

  const quiz = ALL_TASKS.find(t => t.mod.id === 'bread' && t.task.type === 'audio-match')!
  const total = questionCount(quiz)

  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await page.reload()
  await expect(page.getByRole('link', { name: /^Bread/ })).toBeVisible()

  // The precache is filled in the background, so wait for this quiz's content
  // to be in it. Precached urls carry a revision, so the search is ignored.
  const precached = (url: string) =>
    page.evaluate(u => caches.match(u, { ignoreSearch: true }).then(r => !!r), url)
  for (const url of [quiz.mod.dataUrl, `${quiz.mod.imageBase}baguette.jpg`, `${quiz.mod.audioBase}baguette_name.mp3`]) {
    await expect.poll(() => precached(url), { message: url, timeout: 30_000 }).toBe(true)
  }

  api.mode = 'offline'
  await context.setOffline(true)
  // Nothing but the cache can answer now, so what follows is served from it.
  expect(await page.evaluate(() => fetch('/content/not-precached.json').then(r => r.ok, () => false))).toBe(false)

  await page.goto(`/#/${quiz.mod.id}/${quiz.task.id}`)
  await waitForQuiz(page, quiz)
  await completeQuiz(page, quiz, { correct: true })
  await expect(page.getByText(`${total}/${total}`)).toBeVisible()

  // The worker answered for the sound as well as the page.
  const [src] = await audioSrcs(page)
  await expect.poll(() => page.evaluate(s => fetch(s).then(r => r.ok, () => false), src)).toBe(true)
})
