import type { Page } from '@playwright/test'
import { test, expect, pauseClock } from './fixtures'
import { DESCRIBE_GAME } from '../src/data/modules'

// Six words, so a two-turn game never runs the deck out and finishes early.
const WORDS = ['kettle', 'whisk', 'tongs', 'ladle', 'teapot', 'blender']

declare global {
  interface Window { __tones: number }
}

/**
 * Counts the sounds the page plays, instead of playing them: the test can then
 * say that time was called out loud, and the run doesn't need the machine's
 * speakers — which the recorder's tests are busy with for their fake microphone.
 */
async function countTones(page: Page) {
  await page.addInitScript(() => {
    window.__tones = 0
    const node = () => ({
      frequency: { value: 0 },
      gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: <T>(to: T) => to,
      start: () => { window.__tones++ },
      stop() {},
    })
    window.AudioContext = class {
      currentTime = 0
      destination = {}
      createOscillator = node
      createGain = node
    } as unknown as typeof AudioContext
  })
}

test.beforeEach(async ({ page, api }) => {
  api.state.game = { words: WORDS, seconds: 30, turns: 2 }
  await countTones(page)
  // The turn is timed, so tests move the clock on rather than waiting.
  await pauseClock(page)
})

/** The word on the describer's screen, which the test can't predict: the deck is shuffled. */
const word = (page: Page) => page.getByRole('main').locator('p').last()

async function addPlayers(page: Page, ...names: string[]) {
  for (const name of names) {
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Name').press('Enter')
  }
}

test('plays a game through to the scores', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(`^${DESCRIBE_GAME.title}`) }).click()

  // It takes two to play: one describer and someone to guess.
  await addPlayers(page, 'Amira')
  await expect(page.getByRole('button', { name: 'Add 2 or more players' })).toBeDisabled()
  await addPlayers(page, 'Ben')
  await expect(page.getByText('2 turns. 30 seconds for each turn.')).toBeVisible()
  await page.getByRole('button', { name: 'Start the game' }).click()

  // Amira's turn: one word guessed, then the timer runs out on a second.
  await expect(page.getByText('Pass the phone to')).toBeVisible()
  await expect(page.getByText('Amira')).toBeVisible()
  await expect(page.getByText('Turn 1 of 2')).toBeVisible()
  await page.getByRole('button', { name: 'Start' }).click()

  await expect(page.getByText('Guessed: 0')).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByText('Guessed: 1')).toBeVisible()

  const caughtByTheClock = await word(page).textContent()
  await page.clock.runFor(30_000)
  await expect(page.getByText("Time's up! Did they guess it?")).toBeVisible()
  // Time is called out loud, since the phone is face up on the table.
  expect(await page.evaluate(() => window.__tones)).toBe(1)
  // The word is still on screen, since the table may have got it as time ran out.
  await expect(word(page)).toHaveText(caughtByTheClock!)
  await page.getByRole('button', { name: 'Yes' }).click()

  // Ben's turn: his one word is skipped, and nothing is guessed when time runs out.
  await expect(page.getByText('Amira got 2 words.')).toBeVisible()
  await expect(page.getByText('Turn 2 of 2')).toBeVisible()
  await page.getByRole('button', { name: 'Start' }).click()
  const skipped = await word(page).textContent()
  await page.getByRole('button', { name: 'Skip' }).click()
  const missed = await word(page).textContent()
  await page.clock.runFor(30_000)
  await page.getByRole('button', { name: 'No' }).click()

  await expect(page.getByRole('heading', { name: 'Well done!' })).toBeVisible()
  await expect(page.getByText('2 words in 2 turns')).toBeVisible()
  // Two words over two full turns.
  await expect(page.getByText('1.0')).toBeVisible()
  await expect(page.getByText('words for each turn')).toBeVisible()

  const row = (name: string) => page.getByText(new RegExp(`^${name}$`)).locator('..')
  await expect(row('Amira')).toContainText('2 words')
  await expect(row('Ben')).toContainText('0 words')

  const skippedList = page.locator('section').filter({ hasText: 'Words you skipped' })
  await expect(skippedList).toContainText(skipped!)
  await expect(skippedList).toContainText(missed!)

  // Playing again keeps the same table, starting from Amira.
  await page.getByRole('button', { name: 'Play again' }).click()
  await expect(page.getByText('Turn 1 of 2')).toBeVisible()
  await expect(page.getByText('Amira')).toBeVisible()
})

// The turn's end time is kept as a clock time, not a countdown, so the phone
// being locked, called or reloaded mid-turn doesn't hand back a fresh 30 seconds.
test('carries on from where it was after a reload mid-turn', async ({ page }) => {
  await page.goto(`/#/${DESCRIBE_GAME.id}`)
  await addPlayers(page, 'Amira', 'Ben')
  await page.getByRole('button', { name: 'Start the game' }).click()
  await page.getByRole('button', { name: 'Start' }).click()

  await page.getByRole('button', { name: 'Got it' }).click()
  const showing = await word(page).textContent()
  await page.clock.runFor(10_000)
  await expect(page.getByText('20', { exact: true })).toBeVisible()

  await page.reload()

  await expect(page.getByText('Amira')).toBeVisible()
  await expect(page.getByText('Guessed: 1')).toBeVisible()
  await expect(word(page)).toHaveText(showing!)
  await expect(page.getByText('20', { exact: true })).toBeVisible()
})

test('the players are still there for the next game', async ({ page }) => {
  await page.goto(`/#/${DESCRIBE_GAME.id}`)
  await addPlayers(page, 'Amira', 'Ben')
  await page.getByRole('button', { name: 'Start the game' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()

  // Finish the game, then ask for new players: the game goes, but the names
  // stay, so changing the table doesn't mean typing everyone in again.
  await page.clock.runFor(30_000)
  await page.getByRole('button', { name: 'Yes' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await page.clock.runFor(30_000)
  await page.getByRole('button', { name: 'No' }).click()
  await page.getByRole('button', { name: 'New players' }).click()

  await expect(page.getByRole('heading', { name: 'Who is playing?' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Amira' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Ben' }).click()
  await expect(page.getByRole('button', { name: 'Add 2 or more players' })).toBeDisabled()
})

test('the leader can call time between turns', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  await page.goto(`/#/${DESCRIBE_GAME.id}`)
  await addPlayers(page, 'Amira', 'Ben')
  await page.getByRole('button', { name: 'Start the game' }).click()

  await page.getByRole('button', { name: 'End game' }).click()
  await expect(page.getByRole('heading', { name: 'Well done!' })).toBeVisible()
  await expect(page.getByText('0 words in 0 turns')).toBeVisible()
})

test('says what to do when the teacher has set no words', async ({ page, api }) => {
  api.state.game = { words: [], seconds: 30, turns: 2 }
  await page.goto(`/#/${DESCRIBE_GAME.id}`)

  await expect(page.getByText('There are no words yet. Ask your teacher.')).toBeVisible()
  await expect(page.getByPlaceholder('Name')).toHaveCount(0)
})
