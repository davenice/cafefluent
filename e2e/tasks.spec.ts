import { test, expect } from './fixtures'
import { ALL_TASKS, waitForQuiz } from './helpers/quiz'

// Catches broken content as soon as it's added: a bad data file, a wrong
// dataUrl, or an image that doesn't load.
for (const quiz of ALL_TASKS) {
  const { mod, task } = quiz

  test(`${mod.id}/${task.id} (${task.type}) opens with its images`, async ({ page }) => {
    await page.goto(`/#/${mod.id}/${task.id}`)
    await waitForQuiz(page, quiz)

    await expect(page.getByRole('heading', { name: task.title })).toBeVisible()
    await expect.poll(() => page.getByRole('main').locator('img').evaluateAll(imgs =>
      imgs.filter(img => !(img as HTMLImageElement).complete || (img as HTMLImageElement).naturalWidth === 0)
        .map(img => (img as HTMLImageElement).src),
    )).toEqual([])
  })
}
