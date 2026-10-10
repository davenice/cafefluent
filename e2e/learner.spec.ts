import { test, expect } from '@playwright/test'
import { FakeConfigApi } from './fakeConfigApi'

test('completing a study guide is remembered', async ({ page, context }) => {
  await new FakeConfigApi({ enabledModules: ['allergens'] }).install(context)
  await page.goto('/')

  await page.getByRole('link', { name: /^Allergens/ }).click()
  await page.getByRole('link', { name: /Meet the allergens/ }).click()
  await page.getByRole('button', { name: 'Mark revision complete' }).click()

  const studyGuide = page.getByRole('link', { name: /Meet the allergens/ })
  await expect(studyGuide).toContainText('✓ Complete')

  await page.reload()
  await expect(studyGuide).toContainText('✓ Complete')

  await page.getByRole('button', { name: '← Back' }).click()
  await expect(page.getByRole('link', { name: /^Allergens/ })).toContainText('1/4')
})
