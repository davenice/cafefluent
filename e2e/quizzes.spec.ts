import { test, expect, pauseClock } from './fixtures'
import {
  completeQuiz, correctAnswer, oneTaskPerType, questionCount, tasksOfType, waitForQuiz, wrongAnswer,
} from './helpers/quiz'

test.beforeEach(async ({ page }) => {
  // Each answer is followed by a pause of a second or two; tests move the clock on instead.
  await pauseClock(page)
})

for (const quiz of oneTaskPerType()) {
  const { mod, task } = quiz
  const total = questionCount(quiz)

  test(`${task.type}: a perfect score is shown and saved`, async ({ page }) => {
    await page.goto(`/#/${mod.id}/${task.id}`)
    await waitForQuiz(page, quiz)
    await completeQuiz(page, quiz, { correct: true })

    await expect(page.getByText('Perfect!')).toBeVisible()
    await expect(page.getByText(`${total}/${total}`)).toBeVisible()

    await page.getByRole('button', { name: 'Try again' }).click()
    await waitForQuiz(page, quiz)

    await page.getByRole('button', { name: `← ${mod.title}` }).click()
    const card = page.getByRole('link', { name: new RegExp(task.title) })
    await expect(card).toContainText(`${total}/${total}`)
    await page.reload()
    await expect(card).toContainText(`${total}/${total}`)
  })
}

test('a worse result replaces the saved one', async ({ page }) => {
  const quiz = tasksOfType('image-match')[0]
  const { mod, task } = quiz
  const total = questionCount(quiz)

  await page.goto(`/#/${mod.id}/${task.id}`)
  await waitForQuiz(page, quiz)
  await completeQuiz(page, quiz, { correct: true })
  await page.getByRole('button', { name: 'Try again' }).click()
  await completeQuiz(page, quiz, { correct: false })

  await expect(page.getByText('Keep practising!')).toBeVisible()
  await expect(page.getByText(`0/${total}`)).toBeVisible()

  await page.getByRole('button', { name: 'Back to module' }).click()
  await expect(page.getByRole('link', { name: new RegExp(task.title) })).toContainText(`0/${total}`)
})

test('a wrong answer marks both the wrong and the right picture', async ({ page }) => {
  const quiz = tasksOfType('sentence-match')[0]
  await page.goto(`/#/${quiz.mod.id}/${quiz.task.id}`)
  await waitForQuiz(page, quiz)

  const right = await correctAnswer(page, quiz)
  const wrong = await wrongAnswer(page, quiz)
  await wrong.click()

  await expect(wrong).toContainText('✗')
  await expect(right.button).toContainText('✓')
  // The sentence is filled in with the answer once it's been given.
  await expect(page.getByRole('main').getByText(new RegExp(right.name, 'i')).first()).toBeVisible()

  await page.clock.runFor(2500)
  await expect(page.getByText(/^2 of /)).toBeVisible()
})

test('after answering, the diagram names the part', async ({ page }) => {
  const quiz = tasksOfType('diagram-audio')[0]
  await page.goto(`/#/${quiz.mod.id}/${quiz.task.id}`)
  await waitForQuiz(page, quiz)
  await expect(page.getByText('Tap the part you hear')).toBeVisible()

  let answer = await correctAnswer(page, quiz)
  await answer.button.click()
  await expect(page.getByText(`✓ ${answer.name}`)).toBeVisible()

  await page.clock.runFor(1200)
  await expect(page.getByText(/— 2 \//)).toBeVisible()
  answer = await correctAnswer(page, quiz, 1)
  await (await wrongAnswer(page, quiz, 1)).click()
  await expect(page.getByText(`✗ It was the ${answer.name}`)).toBeVisible()
})
