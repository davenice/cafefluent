import { test, expect, audioSrcs, pauseClock } from './fixtures'
import { correctAnswer, tasksOfType, waitForQuiz } from './helpers/quiz'

// Every task with audio, since each module keeps its audio in its own folder.
for (const quiz of tasksOfType('audio-match', 'sentence-match', 'diagram-audio')) {
  const { mod, task } = quiz

  test(`${mod.id}/${task.id} (${task.type}) plays a sound that matches an answer`, async ({ page }) => {
    await pauseClock(page)
    await page.goto(`/#/${mod.id}/${task.id}`)
    await waitForQuiz(page, quiz)

    // Played automatically. correctAnswer works the answer out from the file name,
    // so this also checks the file is for one of the answers on screen.
    const answer = await correctAnswer(page, quiz)
    await expect(answer.button).toBeVisible()

    const [src] = await audioSrcs(page)
    const res = await page.request.get(src)
    expect(res.status(), src).toBe(200)
    expect(res.headers()['content-type']).toContain('audio')

    await page.getByRole('button', { name: /Play audio|Playing…/ }).click()
    await expect.poll(() => audioSrcs(page)).toEqual([src, src])
  })
}
