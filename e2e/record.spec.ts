import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { readFileSync } from 'fs'
import { FakeRecordingsApi, type FakeContributor } from './fakeRecordingsApi'
import { MODULES } from '../src/data/modules'
import { buildScript, phraseKey } from '../src/recorder/script'

declare global {
  interface Window {
    __speak: (on: boolean) => void
    __background: (gain: number) => void
    __micStream: MediaStream | null
  }
}

// The contributor page (record.html), opened from a personal link.

let recordings: FakeRecordingsApi

test.beforeEach(async ({ context }) => {
  recordings = new FakeRecordingsApi()
  await recordings.install(context)
})

/** Every phrase the recorder asks for, built the way the page builds it. */
function allPhrases() {
  return buildScript(
    MODULES.filter((m) => m.audioBase).map((m) => ({
      id: m.id,
      title: m.title,
      data: JSON.parse(readFileSync(`public${m.dataUrl}`, 'utf8')),
    })),
  )
}

const open = (page: Page, contributor: FakeContributor) => page.goto(`/record.html?t=${contributor.token}`)

/**
 * Replaces the microphone with a tone the test turns on and off with
 * `window.__speak`, standing in for someone reading a phrase, over a background
 * hum set with `window.__background`. Silent until then, so the room check
 * passes. The stream is kept in `window.__micStream`, to check it is let go.
 */
async function fakeMic(page: Page) {
  await page.addInitScript(() => {
    let speech: GainNode | null = null
    let hum: GainNode | null = null
    // Set before the mic opens, so a noisy room can be there from the start.
    let backgroundGain = 0
    window.__micStream = null
    window.__speak = (on) => {
      if (speech) speech.gain.value = on ? 0.8 : 0
    }
    window.__background = (gain) => {
      backgroundGain = gain
      if (hum) hum.gain.value = gain
    }
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext()
      await ctx.resume()
      const out = ctx.createMediaStreamDestination()
      const voice = ctx.createOscillator()
      voice.frequency.value = 220
      speech = ctx.createGain()
      speech.gain.value = 0
      voice.connect(speech).connect(out)
      voice.start()
      const fan = ctx.createOscillator()
      fan.frequency.value = 90
      hum = ctx.createGain()
      hum.gain.value = backgroundGain
      fan.connect(hum).connect(out)
      fan.start()
      window.__micStream = out.stream
      return out.stream
    }
  })
}

// A hum at this level measures about −29 dB: too loud for the default limit of −35.
const NOISY_ROOM = 0.05

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

/** Pretend the page went into the background, or came back from it. */
async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

/** The device takes the microphone away, as it does when another app wants it. */
const stopMic = (page: Page) => page.evaluate(() => window.__micStream!.getTracks().forEach((t) => t.stop()))

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
    // Recorded phrases are listed first.
    const row = page.getByRole('listitem').first()
    await expect(row).toContainText(/^Milk/)
    await expect(row).toContainText('saved earlier')
    await expect(row.getByRole('button', { name: 'Play' })).toHaveCount(0)
    await expect(page.getByRole('listitem').nth(1)).toContainText('not recorded')
  })

  test('asks first for a phrase no one else has recorded', async ({ page }) => {
    const phrases = allPhrases()
    const target = phrases[7]
    const sam = recordings.add('Sam', { consented: true })
    for (const p of phrases) if (p !== target) sam.clips.set(phraseKey(p), Buffer.alloc(0))

    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)
    await expect(page.getByText(target.text, { exact: true })).toBeVisible()
  })

  test('uses what others have recorded since the page opened', async ({ page }) => {
    const phrases = allPhrases()
    const target = phrases[11]
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()

    // Sam records everything but one while Amira's page sits open.
    const sam = recordings.add('Sam', { consented: true })
    for (const p of phrases) if (p !== target) sam.clips.set(phraseKey(p), Buffer.alloc(0))

    await startRecording(page)
    await expect(page.getByText(target.text, { exact: true })).toBeVisible()
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

test.describe('finishing and pausing', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the fake microphone needs Chromium')
  test.beforeEach(async ({ page }) => fakeMic(page))

  test('finishes for now: lets go of the microphone and says how to come back', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)
    await readPhrase(page)
    await expect(page.getByText('All recordings sent.')).toBeVisible()

    await page.getByRole('button', { name: 'Finish for now' }).click()
    await expect(page.getByText('Thank you, Amira!')).toBeVisible()
    await expect(page.getByText(/^You have recorded 1 of \d+ phrases\.$/)).toBeVisible()
    await expect(page.getByText('To record more another time, open your link again.')).toBeVisible()
    expect(await page.evaluate(() => window.__micStream!.getTracks().every((t) => t.readyState === 'ended'))).toBe(true)

    // Coming straight back opens the microphone again, after a new room check.
    await page.getByRole('button', { name: 'Record more now' }).click()
    await expect(page.getByText('Ready: read the phrase')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/^1 \/ \d+ recorded/)).toBeVisible()
  })

  test('can finish from the review screen', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)
    await page.getByRole('button', { name: 'Review' }).click()
    await page.getByRole('button', { name: 'Finish for now' }).click()
    await expect(page.getByText('Thank you, Amira!')).toBeVisible()
  })

  test('says what to do when paused', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)

    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByText(/Paused\. Press Resume when you are ready\. If you have finished for today, press Finish for now\./)).toBeVisible()
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByText(/Press Resume when you are ready/)).toHaveCount(0)
  })
})

test.describe('leaving the page and coming back', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the fake microphone needs Chromium')
  test.beforeEach(async ({ page }) => fakeMic(page))

  test('pauses while the page is in the background', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)

    await setHidden(page, true)
    await expect(page.getByText('Paused', { exact: true })).toBeVisible()

    // The microphone survived, so there is nothing to explain.
    await setHidden(page, false)
    await expect(page.getByText(/The microphone stopped/)).toHaveCount(0)
    await page.getByRole('button', { name: 'Resume' }).click()
    await readPhrase(page)
    await expect(page.getByText('All recordings sent.')).toBeVisible()
    expect(contributor.clips.size).toBe(1)
  })

  test('opens the microphone again when the device took it away', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)

    await setHidden(page, true)
    await stopMic(page)
    await setHidden(page, false)
    await expect(page.getByText(/^The microphone stopped\./)).toBeVisible()

    // Resume opens a new stream, in the tap, and recording carries on.
    await page.getByRole('button', { name: 'Resume' }).click()
    await readPhrase(page)
    expect(await page.evaluate(() => window.__micStream!.getAudioTracks()[0].readyState)).toBe('live')
    expect(contributor.clips.size).toBe(1)
  })

  test('notices the microphone stopping while the page is open', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await startRecording(page)

    await stopMic(page)
    await expect(page.getByText(/^The microphone stopped\./)).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Resume' }).click()
    await readPhrase(page)
    expect(contributor.clips.size).toBe(1)
  })

  test('goes back to the start if the microphone stops during the room check', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByText(/Checking the room/)).toBeVisible()

    await stopMic(page)
    await expect(page.getByText('The microphone stopped. Press Start to try again.')).toBeVisible({ timeout: 10_000 })
    // Start opens it again, rather than reusing the one that stopped.
    await startRecording(page)
    await readPhrase(page)
    expect(contributor.clips.size).toBe(1)
  })
})

test.describe('a noisy room', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the fake microphone needs Chromium')
  test.beforeEach(async ({ page }) => {
    await fakeMic(page)
    await page.addInitScript((gain) => window.__background(gain), NOISY_ROOM)
  })

  test('can be recorded in anyway', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByText(/The room is too noisy/)).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Record anyway' }).click()
    await expect(page.getByText('Ready: read the phrase')).toBeVisible()
    // The hum carries on, but doesn't pause recording.
    await readPhrase(page)
    await expect(page.getByText('All recordings sent.')).toBeVisible()
    expect(contributor.clips.size).toBe(1)
  })

  test('passes the room check with a looser limit typed into the settings', async ({ page }) => {
    const contributor = recordings.add('Amira', { consented: true })
    await open(page, contributor)
    await page.getByText('Settings').click()
    const limit = page.getByLabel(/Quiet room limit/)
    await expect(limit).toHaveValue('35')
    await limit.fill('25')
    await expect(page.getByText(/25 means the background must be quieter than -25 dB/)).toBeVisible()

    await startRecording(page)
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
