import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { TEST_ADMIN_KEY } from './fakeConfigApi'
import { FakeRecordingsApi } from './fakeRecordingsApi'

// The admin page's Voice contributors section.

let recordings: FakeRecordingsApi

test.beforeEach(async ({ context }) => {
  recordings = new FakeRecordingsApi()
  await recordings.install(context)
})

async function signIn(page: Page) {
  await page.goto('/#/admin')
  await page.getByLabel('Password').fill(TEST_ADMIN_KEY)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Voice contributors' })).toBeVisible()
}

const section = (page: Page) => page.getByRole('region', { name: 'Voice contributors' })
const row = (page: Page, name: string) => section(page).getByRole('listitem').filter({ hasText: name })

test('lists contributors with how far each has got', async ({ page }) => {
  const amira = recordings.add('Amira', { consented: true })
  amira.clips.set('allergens/milk_name.wav', Buffer.alloc(0))
  amira.clips.set('allergens/eggs_name.wav', Buffer.alloc(0))
  recordings.add('Sam')
  recordings.add('Jo', { consented: true }).revoked = true
  await signIn(page)

  await expect(row(page, 'Amira')).toContainText('2 recordings · agreed · added 01/10/2026')
  await expect(row(page, 'Sam')).toContainText('0 recordings · not started')
  await expect(row(page, 'Jo')).toContainText('link stopped')
  await expect(row(page, 'Jo').getByRole('button')).toHaveCount(0)
})

test('says when there is no one yet', async ({ page }) => {
  await signIn(page)
  await expect(section(page).getByText('No one yet.')).toBeVisible()
})

test('adds a contributor and shows their link once, which opens their recorder', async ({ page, context }) => {
  await signIn(page)
  const add = section(page).getByRole('button', { name: 'Add and make link' })
  await expect(add).toBeDisabled()

  await section(page).getByLabel('Name').fill('  Amira Haddad ')
  await add.click()

  const link = section(page).getByLabel('Link for Amira Haddad')
  const contributor = recordings.contributors[0]
  await expect(link).toHaveValue(new RegExp(`/record\\.html\\?t=${contributor.token}$`))
  await expect(section(page).getByText('This is the only time the link is shown.')).toBeVisible()
  await expect(row(page, 'Amira Haddad')).toContainText('0 recordings · not started')
  await expect(section(page).getByLabel('Name')).toHaveValue('')

  const recorder = await context.newPage()
  await recorder.goto(await link.inputValue())
  await expect(recorder.getByText('Hello, Amira Haddad. Thank you for helping.')).toBeVisible()

  await section(page).getByRole('button', { name: 'Done' }).click()
  await expect(link).toHaveCount(0)
})

test('copies the link', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions can only be granted in Chromium')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await signIn(page)
  await section(page).getByLabel('Name').fill('Amira')
  await section(page).getByRole('button', { name: 'Add and make link' }).click()

  await section(page).getByRole('button', { name: 'Copy link' }).click()
  await expect(section(page).getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/record\.html\?t=test-token-1$/)
})

test('stops a link after asking, keeping the row', async ({ page }) => {
  const amira = recordings.add('Amira', { consented: true })
  await signIn(page)

  // Saying no to the question leaves the link working.
  page.once('dialog', (d) => d.dismiss())
  await row(page, 'Amira').getByRole('button', { name: 'Stop Amira’s link' }).click()
  expect(amira.revoked).toBe(false)

  page.once('dialog', (d) => {
    expect(d.message()).toContain('Their recordings are kept')
    return d.accept()
  })
  await row(page, 'Amira').getByRole('button', { name: 'Stop Amira’s link' }).click()
  await expect(row(page, 'Amira')).toContainText('link stopped')
  expect(amira.revoked).toBe(true)
})

test('explains when the recordings server rejects the password', async ({ page }) => {
  recordings.adminKey = 'a-different-key'
  await signIn(page)
  await expect(section(page).getByText('ADMIN_KEY must be the same on both Lambdas.')).toBeVisible()
})

test('offers to try again when the recordings server fails', async ({ page }) => {
  recordings.add('Amira')
  recordings.mode = 'error'
  await signIn(page)
  await expect(section(page).getByText('Could not load the contributors.')).toBeVisible()

  recordings.mode = 'ok'
  await section(page).getByRole('button', { name: 'Try again' }).click()
  await expect(row(page, 'Amira')).toBeVisible()
})

test('shows an error when adding fails, keeping the name typed', async ({ page }) => {
  await signIn(page)
  recordings.mode = 'error'
  await section(page).getByLabel('Name').fill('Amira')
  await section(page).getByRole('button', { name: 'Add and make link' }).click()
  await expect(section(page).getByText('Could not add them. Try again.')).toBeVisible()
  await expect(section(page).getByLabel('Name')).toHaveValue('Amira')
})
