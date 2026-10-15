import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { FakeRecordingsApi, type FakeContributor } from './fakeRecordingsApi'

declare global {
  interface Window { __speak: (on: boolean) => void }
}

// The contributor page (record.html), opened from a personal link.

let recordings: FakeRecordingsApi

test.beforeEach(async ({ context }) => {
  recordings = new FakeRecordingsApi()
  await recordings.install(context)
})

const open = (page: Page, contributor: FakeContributor) => page.goto(`/record.html?t=${contributor.token}`)

/**
 * Replaces the microphone with a tone the test turns on and off with
 * `window.__speak`, standing in for someone reading a phrase. Silent until then,
 * so the room check passes.
 */
async function fakeMic(page: Page) {
  await page.addInitScript(() => {
    let gain: GainNode | null = null
    window.__speak = (on) => {
      if (gain) gain.gain.value = on ? 0.3 : 0
    }
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext()
      await ctx.resume()
      const tone = ctx.createOscillator()
      tone.frequency.value = 220
      gain = ctx.createGain()
      gain.gain.value = 0
      const out = ctx.createMediaStreamDestination()
      tone.connect(gain).connect(out)
      tone.start()
      return out.stream
    }
  })
}

/**
 * Drop or restore the connection. The fake API is told too, since Playwright's
 * routes still answer while the context is offline; going back online fires the
 * page's 'online' event.
 */
async function setOnline(page: Page, online: boolean) {
  recordings.mode = online ? 'ok' : 'offline'
  await page.context().setOffline(!online)
}

/** Start recording, past the 3-second room check. */
async function startRecording(page: Page) {
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText('Ready: read the phrase')).toBeVisible({ timeout: 10_000 })
}

/** "Read" the phrase on screen. The clip ends after two seconds of silence. */
async function readPhrase(page: Page) {
  await page.evaluate(() => window.__speak(true))
  await expect(page.getByText('Recording…')).toBeVisible()
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__speak(false))
  await expect(page.getByText('Ready: read the phrase')).toBeVisible({ timeout: 5_000 })
}

test('without a token, asks for the personal link', async ({ page }) => {
  await page.goto('/record.html')
  await expect(page.getByText('This page needs your personal link.')).toBeVisible()
})

test('with an unknown or revoked token, says the link does not work', async ({ page }) => {
  const contributor = recordings.add('Amira')
  contributor.revoked = true
  await open(page, contributor)
  await expect(page.getByText('This link does not work.')).toBeVisible()
})

test('when the server fails, offers to try again', async ({ page }) => {
  const contributor = recordings.add('Amira')
  recordings.mode = 'error'
  await open(page, contributor)
  await expect(page.getByText('We could not connect.')).toBeVisible()

  recordings.mode = 'ok'
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Hello, Amira. Thank you for helping.')).toBeVisible()
})

test('asks a new contributor to agree before recording', async ({ page }) => {
  const contributor = recordings.add('Amira')
  await open(page, contributor)

  const proceed = page.getByRole('button', { name: 'Continue' })
  await expect(proceed).toBeDisabled()
  await page.getByLabel(/I agree to my voice being recorded/).check()
  await proceed.click()

  await expect(page.getByText('Hello, Amira.', { exact: true })).toBeVisible()
  expect(contributor.consented).toBe(true)
  // The name comes from the link, and nothing is downloaded.
  await expect(page.getByLabel('Speaker name')).toHaveCount(0)
  await expect(page.getByText('Each recording is sent to us as soon as you make it.')).toBeVisible()
})

test('takes a contributor who has agreed straight to the recorder', async ({ page }) => {
  const contributor = recordings.add('Amira', { consented: true })
  await open(page, contributor)
  await expect(page.getByText('Hello, Amira.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
})

test.describe('recording', () => {
  // WebKit only lets audio start without a fresh tap while a real microphone is
  // capturing. The fake mic isn't one, so there it fails at random.
  test.skip(({ browserName }) => browserName !== 'chromium', 'the fake microphone needs Chromium')
  test.beforeEach(async ({ page }) => fakeMic(page))

  test('sends each clip to the server as soon as it is recorded', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)

    await readPhrase(page)
    await expect(page.getByText('All recordings sent.')).toBeVisible()
    await expect(page.getByText(/^1 \/ \d+ recorded/)).toBeVisible()

    expect(contributor.clips.size).toBe(1)
    const [key, wav] = [...contributor.clips][0]
    expect(key).toMatch(/^[a-z-]+\/[a-z0-9-]+_[a-z0-9-]+\.wav$/)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
  })

  test('counts clips saved on another device as done', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    contributor.clips.set('allergens/milk_name.wav', Buffer.alloc(0))
    await open(page, contributor)
    await startRecording(page)
    await expect(page.getByText(/^1 \/ \d+ recorded/)).toBeVisible()

    await page.getByRole('button', { name: 'Review' }).click()
    const row = page.getByRole('listitem').filter({ hasText: /^Milk/ }).filter({ hasText: 'saved earlier' })
    await expect(row).toBeVisible()
    await expect(row.getByRole('button', { name: 'Play' })).toHaveCount(0)
  })

  test('keeps clips while offline and sends them when the connection is back', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)

    await setOnline(page, false)
    await readPhrase(page)
    await expect(page.getByText(/No connection\. 1 recording saved on this device/)).toBeVisible()
    expect(contributor.clips.size).toBe(0)

    await setOnline(page, true)
    await expect(page.getByText('All recordings sent.')).toBeVisible()
    expect(contributor.clips.size).toBe(1)
  })

  test('sends clips left from an earlier visit', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)
    await setOnline(page, false)
    await readPhrase(page)
    await expect(page.getByText(/No connection/)).toBeVisible()

    // The page is closed before the clip could be sent. It waits in the browser
    // and goes when the link is opened again.
    await page.goto('about:blank')
    await setOnline(page, true)
    expect(contributor.clips.size).toBe(0)
    await open(page, contributor)
    await expect.poll(() => contributor.clips.size).toBe(1)
  })

  test('stops when the link is revoked mid-session', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)

    contributor.revoked = true
    await readPhrase(page).catch(() => {}) // recording pauses, so "Ready" never comes back
    await expect(page.getByText('This link has stopped working. Ask the person who sent it for a new one.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
    expect(contributor.clips.size).toBe(0)
  })
})

test.describe('on a device with the learner app', () => {
  // Needs the real service worker, which only Chromium lets Playwright route around.
  test.use({ serviceWorkers: 'allow' })
  test.skip(({ browserName }) => browserName !== 'chromium', 'service worker requests are only routable in Chromium')

  test('opens the contributor page, not the app', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await expect(page.getByText('Hello, Amira.', { exact: true })).toBeVisible()
  })
})
