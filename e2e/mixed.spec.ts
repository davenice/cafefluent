import type { Page } from '@playwright/test'
import { test, expect, audioSrcs, pauseClock } from './fixtures'
import { FakeConfigApi } from './fakeConfigApi'
import { MIXED_QUIZ } from '../src/data/modules'
import { QUIZ_LENGTH } from '../src/components/quiz/mixedQuestions'
import { completeMixedQuiz, correctAnswer, currentMixedQuiz, waitForMixedQuiz } from './helpers/quiz'

test.beforeEach(async ({ page }) => {
  // Each answer is followed by a pause of a second or two; tests move the clock on instead.
  await pauseClock(page)
})

test('asks twenty-five questions and saves the result', async ({ page }) => {
  await page.goto(`/#/${MIXED_QUIZ.id}`)
  await completeMixedQuiz(page, { correct: true })

  await expect(page.getByText('Perfect!')).toBeVisible()
  await expect(page.getByText(`${QUIZ_LENGTH}/${QUIZ_LENGTH}`)).toBeVisible()
  await expect(page.getByText('You did well in every module.')).toBeVisible()

  await page.getByRole('button', { name: 'Back to home' }).click()
  const card = page.getByRole('link', { name: new RegExp(`^${MIXED_QUIZ.title}`) })
  await expect(card).toContainText(`${QUIZ_LENGTH}/${QUIZ_LENGTH}`)
  await page.reload()
  await expect(card).toContainText(`${QUIZ_LENGTH}/${QUIZ_LENGTH}`)
})

test('ends with how each module went, and where to practise', async ({ page, context }) => {
  await new FakeConfigApi({ enabledModules: ['bread', 'milk', MIXED_QUIZ.id] }).install(context)
  await page.goto(`/#/${MIXED_QUIZ.id}`)

  // Every question wrong, so both modules are worth practising again.
  await completeMixedQuiz(page, { correct: false })

  await expect(page.getByRole('heading', { name: 'How you did' })).toBeVisible()
  const summary = page.getByRole('listitem')
  await expect(summary.filter({ hasText: 'Bread' })).toContainText('0 /')
  await expect(summary.filter({ hasText: 'Milk' })).toContainText('0 /')

  await expect(page.getByRole('heading', { name: 'Practise these again' })).toBeVisible()
  await page.getByRole('link', { name: /Bread/ }).click()
  await expect(page.getByRole('heading', { name: 'Bread', exact: true, level: 1 })).toBeVisible()
})

test('keeps the best result, not the latest', async ({ page, context }) => {
  await new FakeConfigApi({ enabledModules: ['bread', 'kitchen-equipment', MIXED_QUIZ.id] }).install(context)
  const total = QUIZ_LENGTH

  await page.goto(`/#/${MIXED_QUIZ.id}`)
  await completeMixedQuiz(page, { correct: true })
  await expect(page.getByText(`${total}/${total}`)).toBeVisible()

  await page.getByRole('button', { name: 'Try again' }).click()
  await completeMixedQuiz(page, { correct: false })
  await expect(page.getByText(`0/${total}`)).toBeVisible()

  await page.getByRole('button', { name: 'Back to home' }).click()
  await expect(page.getByRole('link', { name: new RegExp(`^${MIXED_QUIZ.title}`) }))
    .toContainText(`${total}/${total}`)
})

test('draws only on the modules that are enabled', async ({ page, context }) => {
  await new FakeConfigApi({ enabledModules: ['bread', 'milk', MIXED_QUIZ.id] }).install(context)
  await page.goto(`/#/${MIXED_QUIZ.id}`)
  await waitForMixedQuiz(page)

  const seen = new Set<string>()
  for (let asked = 0; asked < QUIZ_LENGTH; asked++) {
    const { mod } = await currentMixedQuiz(page)
    seen.add(mod.id)
    await completeOneQuestion(page)
  }

  await expect(page.getByText(`${QUIZ_LENGTH}/${QUIZ_LENGTH}`)).toBeVisible()
  expect([...seen].sort()).toEqual(['bread', 'milk'])
})

test('is offered only once there are two modules to mix', async ({ page, context }) => {
  const api = new FakeConfigApi({ enabledModules: ['bread', MIXED_QUIZ.id] })
  await api.install(context)
  const card = page.getByRole('link', { name: new RegExp(`^${MIXED_QUIZ.title}`) })

  await page.goto('/')
  await expect(page.getByRole('link', { name: /^Bread/ })).toBeVisible()
  await expect(card).toHaveCount(0)

  api.state.enabledModules = ['bread', 'milk', MIXED_QUIZ.id]
  await page.reload()
  await expect(card).toBeVisible()
})

test('is not offered when it is switched off', async ({ page, context }) => {
  await new FakeConfigApi({ enabledModules: ['bread', 'milk'] }).install(context)
  await page.goto('/')

  await expect(page.getByRole('link', { name: /^Bread/ })).toBeVisible()
  await expect(page.getByText('Revision')).toHaveCount(0)
})

// A learner who kept the link, or came back to it, after the modules it mixed
// were switched off.
test('says when there is nothing left to mix', async ({ page, context }) => {
  await new FakeConfigApi({ enabledModules: [MIXED_QUIZ.id] }).install(context)
  await page.goto(`/#/${MIXED_QUIZ.id}`)

  await expect(page.getByText('There are no quizzes to mix yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page.getByRole('heading', { name: 'CafeFluent' })).toBeVisible()
})

/** Answers the question on screen correctly, by whatever means its quiz needs. */
async function completeOneQuestion(page: Page) {
  const quiz = await currentMixedQuiz(page)
  const seen = (await audioSrcs(page)).length
  await (await correctAnswer(page, quiz, seen)).button.click()
  // Past the longest pause after an answer.
  await page.clock.runFor(2500)
}
