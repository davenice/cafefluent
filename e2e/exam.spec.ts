import { test, expect } from './fixtures'
import { FakeConfigApi } from './fakeConfigApi'
import { FINAL_EXAM } from '../src/data/finalExam'

test('is offered on the home page once it is switched on', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: new RegExp(`^${FINAL_EXAM.title}`) })).toBeVisible()
})

test('stays hidden until it is', async ({ page, context }) => {
  // Its own fake, with everything on except the exam.
  await new FakeConfigApi({ enabledModules: ['bread'] }).install(context)
  await page.goto('/')

  await expect(page.getByRole('link', { name: /^Bread/ })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(`^${FINAL_EXAM.title}`) })).toHaveCount(0)
  await expect(page.getByText('Exam', { exact: true })).toHaveCount(0)
})

test('asks for a name before it will start, and can be left again', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)

  await expect(page.getByRole('heading', { name: FINAL_EXAM.title })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start the exam' })).toBeDisabled()

  await page.getByRole('button', { name: '← Home' }).click()
  await expect(page.getByRole('link', { name: /^Bread/ })).toBeVisible()
})

test('keeps what has been typed when the exam is left and opened again', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)
  await page.getByLabel('Your name').fill('Fatima')
  await page.getByRole('button', { name: 'Start the exam' }).click()
  await expect(page.getByText('Question 1 of 20')).toBeVisible()
  await page.getByRole('textbox').fill('ciabatta')

  await page.reload()

  await expect(page.getByText('We kept your answers from last time.')).toBeVisible()
  await expect(page.getByLabel('Your name')).toHaveValue('Fatima')
  await page.getByRole('button', { name: 'Carry on' }).click()

  // Picks up at the first question with nothing in it, not back at the start.
  await expect(page.getByText('Question 2 of 20')).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('textbox')).toHaveValue('ciabatta')
})

test('is ready to type in as soon as a question appears', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)
  await page.getByLabel('Your name').fill('Fatima')
  await page.getByRole('button', { name: 'Start the exam' }).click()
  await expect(page.getByText('Question 1 of 20')).toBeVisible()

  // Typing with nothing tapped: it only lands if the box already has the focus.
  await page.keyboard.type('ciabatta')
  await expect(page.getByRole('textbox')).toHaveValue('ciabatta')

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Question 2 of 20')).toBeVisible()
  await page.keyboard.type('sourdough')
  await expect(page.getByRole('textbox')).toHaveValue('sourdough')
})

test('Enter moves on from a one-line answer, but makes a new line in a longer one', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)
  // The name field too: one line, one thing to do next.
  await page.getByLabel('Your name').fill('Fatima')
  await page.getByLabel('Your name').press('Enter')
  await expect(page.getByText('Question 1 of 20')).toBeVisible()

  await page.getByRole('textbox').fill('ciabatta')
  await page.getByRole('textbox').press('Enter')
  await expect(page.getByText('Question 2 of 20')).toBeVisible()

  // q8 is the first with a box meant for a list.
  for (let i = 2; i < 8; i++) await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Question 8 of 20')).toBeVisible()

  const box = page.getByRole('textbox')
  await box.fill('coffee')
  await box.press('Enter')
  await box.pressSequentially('milk')

  await expect(page.getByText('Question 8 of 20')).toBeVisible()
  await expect(box).toHaveValue('coffee\nmilk')
})

test('a listening question keeps one play button while the answer is typed', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)
  await page.getByLabel('Your name').fill('Fatima')
  await page.getByRole('button', { name: 'Start the exam' }).click()
  // Found rather than hardcoded: the paper gets reordered.
  const first = FINAL_EXAM.questions.findIndex((q) => q.show.kind.endsWith('audio')) + 1
  for (let i = 1; i < first; i++) await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText(`Question ${first} of 20`)).toBeVisible()

  const play = page.getByRole('button', { name: /Play the sound|Playing/ })
  await expect(play).toHaveCount(1)

  await page.getByRole('textbox').pressSequentially('molluscs')

  await expect(play).toHaveCount(1)
})

test('shows the key with a coffee drink, so the picture can be read', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)
  await page.getByLabel('Your name').fill('Fatima')
  await page.getByRole('button', { name: 'Start the exam' }).click()

  const drink = FINAL_EXAM.questions.findIndex(
    (q) => q.show.kind === 'item-image' && q.show.module === 'coffee-drinks'
  ) + 1
  for (let i = 1; i < drink; i++) await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText(`Question ${drink} of 20`)).toBeVisible()

  // The drink and the key to the notation it is drawn in.
  await expect(page.locator('img[src*="coffee-drinks"]')).toHaveCount(2)
  await expect(page.locator('img[src$="key.svg"]')).toBeVisible()
})

test('the answers cannot be changed once the paper is finished', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)
  await page.getByLabel('Your name').fill('Fatima')
  await page.getByRole('button', { name: 'Start the exam' }).click()
  await page.getByRole('textbox').fill('ciabatta')
  for (let i = 0; i < 20; i++) await page.getByRole('button', { name: /^(Next|See my answers)$/ }).click()

  await expect(page.getByText('Your answers')).toBeVisible()
  // Nothing on this screen goes back to a question: the only way on is to send.
  await expect(page.getByRole('button', { name: /Back|question 1|ciabatta/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send my answers' })).toBeVisible()
})

test('ends with the answers as one numbered message', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)
  await page.getByLabel('Your name').fill('Fatima')
  await page.getByRole('button', { name: 'Start the exam' }).click()
  await page.getByRole('textbox').fill('ciabatta')

  // 19 Nexts to reach the last question, then one more to leave it.
  for (let i = 0; i < 20; i++) await page.getByRole('button', { name: /^(Next|See my answers)$/ }).click()
  await page.getByRole('button', { name: 'Send my answers' }).click()

  const message = page.getByLabel('Your answers')
  // Named for the app, not the exam, so it is recognisable in a WhatsApp thread.
  await expect(message).toHaveValue(new RegExp(`^${FINAL_EXAM.messageTitle}\\nFatima\\n`))
  await expect(message).toHaveValue(/\n1 ciabatta\n/)
  // Every question gets a line, so a message that was cut short is obvious.
  await expect(message).toHaveValue(/\n20 -$/)

  // One way to send, on purpose: copy, then paste into WhatsApp yourself.
  await expect(page.getByRole('button', { name: /WhatsApp/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /WhatsApp/ })).toHaveCount(0)
})

test('does not offer a reload in the middle of the exam', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)
  await page.getByLabel('Your name').fill('Fatima')
  await page.getByRole('button', { name: 'Start the exam' }).click()
  await expect(page.getByText('Question 1 of 20')).toBeVisible()

  // The update bar reloads the page, which part way through the exam would swap
  // the app under someone who has been typing for half an hour.
  await expect(page.getByText('A new version is ready')).toHaveCount(0)
})
