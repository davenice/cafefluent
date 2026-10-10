import { test, expect } from './fixtures'

test('moves between home, module and task with the back buttons', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /^Bread/ }).click()
  await expect(page.getByRole('heading', { name: 'Bread', exact: true })).toBeVisible()

  await page.getByRole('link', { name: /Types of bread/ }).click()
  await expect(page.getByRole('heading', { name: 'Types of bread', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '← Bread' }).click()
  await expect(page.getByRole('heading', { name: 'Bread', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '← Back' }).click()
  await expect(page.getByRole('heading', { name: 'CafeFluent' })).toBeVisible()
})

test("the browser's back button follows the same path", async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /^Bread/ }).click()
  await page.getByRole('link', { name: /Types of bread/ }).click()

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Bread', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'CafeFluent' })).toBeVisible()
})

test('a link straight to a task opens it', async ({ page }) => {
  await page.goto('/#/coffee/task3')
  await expect(page.getByRole('heading', { name: 'Making a basic coffee drink' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check my order' })).toBeVisible()
})

test('an unknown module says so and links home', async ({ page }) => {
  await page.goto('/#/no-such-module')
  await expect(page.getByText('Module not found.')).toBeVisible()
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'CafeFluent' })).toBeVisible()
})

test('an unknown task says so and goes back home', async ({ page }) => {
  await page.goto('/#/allergens/task99')
  await expect(page.getByText('Quiz not found.')).toBeVisible()
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page.getByRole('heading', { name: 'CafeFluent' })).toBeVisible()
})
