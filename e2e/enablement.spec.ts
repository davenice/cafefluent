import { test, expect, type Page } from '@playwright/test'
import { FakeConfigApi, TEST_PIN } from './fakeConfigApi'

const homeCard = (page: Page, title: string) =>
  page.getByRole('main').getByRole('link', { name: new RegExp(`^${title}`) })

test.describe('home page', () => {
  test('shows only the enabled modules', async ({ page, context }) => {
    await new FakeConfigApi({ enabledModules: ['bread'] }).install(context)
    await page.goto('/')

    await expect(homeCard(page, 'Bread')).toBeVisible()
    await expect(homeCard(page, 'Allergens')).toHaveCount(0)
    await expect(page.getByText('Table games')).toHaveCount(0)
  })

  test('shows the table game when it is enabled', async ({ page, context }) => {
    await new FakeConfigApi({ enabledModules: ['describe-it'] }).install(context)
    await page.goto('/')

    await expect(page.getByRole('link', { name: /^Describe it/ })).toBeVisible()
    await expect(homeCard(page, 'Bread')).toHaveCount(0)
  })

  test('shows every module if the config never loaded', async ({ page, context }) => {
    const api = new FakeConfigApi({ enabledModules: ['bread'] })
    api.mode = 'error'
    await api.install(context)
    await page.goto('/')

    await expect(homeCard(page, 'Bread')).toBeVisible()
    await expect(homeCard(page, 'Allergens')).toBeVisible()
  })
})

test.describe('admin page', () => {
  async function signIn(page: Page, pin = TEST_PIN) {
    await page.goto('/#/admin')
    await page.getByPlaceholder('····').fill(pin)
  }

  test('rejects a wrong PIN', async ({ page, context }) => {
    await new FakeConfigApi().install(context)
    await signIn(page, '000000')

    await expect(page.getByText('Incorrect PIN')).toBeVisible()
    await expect(page.getByPlaceholder('····')).toHaveValue('')
  })

  test('shows the current state after the right PIN', async ({ page, context }) => {
    await new FakeConfigApi({
      enabledModules: ['bread'],
      game: { words: ['latte', 'scone'], seconds: 45, turns: 6 },
    }).install(context)
    await signIn(page)

    await expect(page.getByRole('checkbox', { name: /^Bread/ })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: /^Allergens/ })).not.toBeChecked()
    await expect(page.getByLabel('Words, one per line')).toHaveValue('latte\nscone')
    await expect(page.getByLabel('Seconds per turn')).toHaveValue('45')
    await expect(page.getByLabel('Turns per game')).toHaveValue('6')
  })

  test('saving changes what learners see', async ({ page, context }) => {
    const api = new FakeConfigApi({ enabledModules: ['bread'] })
    await api.install(context)
    await signIn(page)

    await page.getByRole('checkbox', { name: /^Allergens/ }).check()
    await page.getByRole('checkbox', { name: /^Bread/ }).uncheck()
    await page.getByRole('button', { name: 'Save' }).click()

    // Save returns to the home page, which fetches the config again.
    await expect(homeCard(page, 'Allergens')).toBeVisible()
    await expect(homeCard(page, 'Bread')).toHaveCount(0)
    expect(api.state.enabledModules).toEqual(['allergens'])
  })

  test('saves the table game settings', async ({ page, context }) => {
    const api = new FakeConfigApi({ enabledModules: [] })
    await api.install(context)
    await signIn(page)

    await page.getByRole('checkbox', { name: /^Describe it/ }).check()
    await page.getByLabel('Words, one per line').fill('flat white\n\ncroissant')
    await page.getByLabel('Seconds per turn').fill('30')
    await page.getByLabel('Turns per game').fill('4')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('link', { name: /^Describe it/ })).toBeVisible()
    expect(api.state.enabledModules).toEqual(['describe-it'])
    expect(api.state.game).toEqual({ words: ['flat white', 'croissant'], seconds: 30, turns: 4 })
  })

  test('explains a server error at the PIN screen', async ({ page, context }) => {
    const api = new FakeConfigApi()
    api.mode = 'error'
    await api.install(context)
    await signIn(page)

    await expect(page.getByText('The server had a problem. Try again later.')).toBeVisible()
  })

  test('explains a lost connection at the PIN screen', async ({ page, context }) => {
    const api = new FakeConfigApi()
    api.mode = 'offline'
    await api.install(context)
    await signIn(page)

    await expect(page.getByText('Could not reach the server. Check the connection.')).toBeVisible()
  })

  test('says when a save fails, and stays on the page', async ({ page, context }) => {
    const api = new FakeConfigApi({ enabledModules: ['bread'] })
    await api.install(context)
    await signIn(page)

    await page.getByRole('checkbox', { name: /^Allergens/ }).check()
    api.mode = 'error'
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Save failed — try again')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /^Allergens/ })).toBeChecked()
    expect(api.state.enabledModules).toEqual(['bread'])
  })
})
