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
  await expect(page.getByText('ciabatta')).toBeVisible()
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

test('ends with the answers as one numbered message', async ({ page }) => {
  await page.goto(`/#/${FINAL_EXAM.id}`)
  await page.getByLabel('Your name').fill('Fatima')
  await page.getByRole('button', { name: 'Start the exam' }).click()
  await page.getByRole('textbox').fill('ciabatta')

  await page.getByRole('button', { name: 'See all my answers' }).click()
  await page.getByRole('button', { name: 'I’ve finished answering' }).click()

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
