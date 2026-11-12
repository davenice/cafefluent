import { test, expect, pauseClock } from './fixtures'
import {
  completeQuiz, correctAnswer, oneTaskPerType, orderSequence, questionCount, sequenceFor, stepHandle,
  tasksOfType, variantOf, waitForQuiz, wrongAnswer,
} from './helpers/quiz'

test.beforeEach(async ({ page }) => {
  // Each answer is followed by a pause of a second or two; tests move the clock on instead.
  await pauseClock(page)
})

for (const quiz of oneTaskPerType()) {
  const { mod, task } = quiz
  const total = questionCount(quiz)
  const name = variantOf(quiz)

  test(`${name}: a perfect score is shown and saved`, async ({ page }) => {
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

  // Every quiz tells the learner how far through they are, in the same words.
  // `sequence-order` is one screen, so it has nothing to count.
  if (task.type !== 'sequence-order') {
    test(`${name}: says which question this is`, async ({ page }) => {
      await page.goto(`/#/${mod.id}/${task.id}`)
      await waitForQuiz(page, quiz)

      await expect(page.getByText(`1 of ${total}`)).toBeVisible()
      await (await correctAnswer(page, quiz)).button.click()
      await page.clock.runFor(2500)
      await expect(page.getByText(`2 of ${total}`)).toBeVisible()
    })
  }
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
  await expect(page.getByText(/— 2 of /)).toBeVisible()
  answer = await correctAnswer(page, quiz, 1)
  await (await wrongAnswer(page, quiz, 1)).click()
  await expect(page.getByText(`✗ It was the ${answer.name}`)).toBeVisible()
})

// The whole point of the quiz: a step counts when it follows the step it should,
// so getting one pair wrong costs that pair and not everything after it.
test('sequence-order: scores the steps in order, and shows the right order', async ({ page }) => {
  const quiz = tasksOfType('sequence-order')[0]
  const steps = sequenceFor(quiz).steps
  const total = steps.length
  await page.goto(`/#/${quiz.mod.id}/${quiz.task.id}`)
  await waitForQuiz(page, quiz)

  await orderSequence(page, quiz)
  // Swap the last two, which costs both of them.
  await stepHandle(page, steps[total - 1].text).press('ArrowUp')
  await page.getByRole('button', { name: 'Check my order' }).click()

  await expect(page.getByText(`${total - 2} of ${total} in the right order`)).toBeVisible()
  await expect(page.getByText('The right order', { exact: true })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveText(steps.map(s => s.text))

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(`${total - 2}/${total}`)).toBeVisible()
})

// The steps are dragged on a phone, and each one's slot is worked out from the
// pointer's position, so only a real pointer on a real layout tests it.
test('sequence-order: a step dragged down the list lands where it was dropped', async ({ page }) => {
  const quiz = tasksOfType('sequence-order')[0]
  await page.goto(`/#/${quiz.mod.id}/${quiz.task.id}`)
  await waitForQuiz(page, quiz)

  const card = (position: number) => page.getByRole('main').locator(`[data-position="${position}"]`)
  const dragged = (await card(1).getByRole('button', { name: /^Drag to reorder:/ }).getAttribute('aria-label'))!
  // One slot, measured off the page rather than assumed.
  const slot = (await card(2).boundingBox())!.y - (await card(1).boundingBox())!.y
  const handle = (await page.getByRole('button', { name: dragged, exact: true }).boundingBox())!
  const x = handle.x + handle.width / 2
  const y = handle.y + handle.height / 2

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + slot * 3, { steps: 10 })
  await page.mouse.up()

  await expect(card(4).getByRole('button', { name: dragged, exact: true })).toBeVisible()
})

test('says so when the quiz data will not load, and goes back', async ({ page }) => {
  const quiz = tasksOfType('image-match')[0]
  await page.route(`**${quiz.mod.dataUrl}`, route => route.abort())
  await page.goto(`/#/${quiz.mod.id}/${quiz.task.id}`)

  await expect(page.getByText('Could not load quiz data.')).toBeVisible()
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page.getByRole('heading', { name: quiz.mod.title, exact: true, level: 1 })).toBeVisible()
})
