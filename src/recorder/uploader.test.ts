import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError } from './api'
import type { StoredClip } from './clipStore'
import { Uploader, RETRY_MIN_MS, RETRY_MAX_MS, type UploadStatus } from './uploader'

function clip(file: string, recordedAt = 1): StoredClip {
  return { speaker: 'amira-3f9a1c', module: 'allergens', file, wav: new ArrayBuffer(8), recordedAt, durationMs: 900, peakDb: -6 }
}

/** The browser outbox, in memory. */
class FakeOutbox {
  clips: StoredClip[] = []
  async pending() {
    return this.clips.filter((c) => !c.uploaded)
  }
  async markUploaded(c: StoredClip) {
    const current = this.clips.find((x) => x.file === c.file)
    if (current?.recordedAt === c.recordedAt) current.uploaded = true
  }
}

/** The server. `fail` decides what happens to each send, by file name. */
class FakeSender {
  sent: string[] = []
  fail: (file: string) => Error | undefined = () => undefined
  async putClip(_module: string, file: string) {
    const error = this.fail(file)
    if (error) throw error
    this.sent.push(file)
  }
}

let outbox: FakeOutbox
let sender: FakeSender
let statuses: UploadStatus[]
let uploader: Uploader
const last = () => statuses.at(-1)

beforeEach(() => {
  vi.useFakeTimers()
  outbox = new FakeOutbox()
  sender = new FakeSender()
  statuses = []
  uploader = new Uploader(outbox, sender, (s) => statuses.push(s))
})

afterEach(() => {
  uploader.stop()
  vi.useRealTimers()
})

describe('Uploader', () => {
  it('sends every clip waiting, counting down, and marks each one sent', async () => {
    outbox.clips = [clip('milk_name.wav'), clip('eggs_name.wav')]
    await uploader.flush()
    expect(sender.sent).toEqual(['milk_name.wav', 'eggs_name.wav'])
    expect(outbox.clips.every((c) => c.uploaded)).toBe(true)
    expect(statuses.map((s) => `${s.state} ${s.pending}`)).toEqual(['sending 2', 'sending 1', 'sending 0', 'idle 0'])
  })

  it('does not send a clip already sent', async () => {
    outbox.clips = [{ ...clip('milk_name.wav'), uploaded: true }]
    await uploader.flush()
    expect(sender.sent).toEqual([])
    expect(last()).toEqual({ state: 'idle', pending: 0, failed: 0 })
  })

  it('picks up a clip saved while it was sending', async () => {
    outbox.clips = [clip('milk_name.wav')]
    let release!: () => void
    const firstSend = new Promise<void>((r) => (release = r))
    const realPut = sender.putClip.bind(sender)
    sender.putClip = vi.fn(async (m: string, f: string) => {
      if (f === 'milk_name.wav') await firstSend
      return realPut(m, f)
    })

    const running = uploader.flush()
    outbox.clips.push(clip('eggs_name.wav'))
    await uploader.flush() // folded into the pass already running
    release()
    await running

    expect(sender.sent).toEqual(['milk_name.wav', 'eggs_name.wav'])
    expect(last()?.state).toBe('idle')
  })

  it('leaves a take recorded again during sending to be sent', async () => {
    outbox.clips = [clip('milk_name.wav', 1)]
    sender.putClip = vi.fn(async () => {
      // The speaker records the phrase again while the first take is on its way.
      outbox.clips = [clip('milk_name.wav', 2)]
    })
    await uploader.flush()
    expect(outbox.clips[0].uploaded).toBeUndefined()
  })

  it('waits and tries again when offline, backing off up to a minute', async () => {
    outbox.clips = [clip('milk_name.wav')]
    sender.fail = () => new TypeError('Failed to fetch')

    await uploader.flush()
    expect(last()).toEqual({ state: 'waiting', pending: 1, failed: 0 })

    const waits = []
    for (let i = 0; i < 6; i++) {
      const before = statuses.length
      let waited = 0
      while (statuses.length === before) {
        await vi.advanceTimersByTimeAsync(1000)
        waited += 1000
      }
      // Each retry reports 'sending' then 'waiting' again.
      waits.push(waited)
    }
    expect(waits).toEqual([RETRY_MIN_MS, RETRY_MIN_MS * 2, RETRY_MIN_MS * 4, RETRY_MIN_MS * 8, RETRY_MAX_MS, RETRY_MAX_MS])

    sender.fail = () => undefined
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS)
    expect(sender.sent).toEqual(['milk_name.wav'])
    expect(last()?.state).toBe('idle')
  })

  it('tries again when the server fails', async () => {
    outbox.clips = [clip('milk_name.wav')]
    sender.fail = () => new ApiError(500, 'Internal error')
    await uploader.flush()
    expect(last()?.state).toBe('waiting')
    sender.fail = () => undefined
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS)
    expect(sender.sent).toEqual(['milk_name.wav'])
  })

  it('sends at once when asked, without waiting for the retry', async () => {
    outbox.clips = [clip('milk_name.wav')]
    sender.fail = () => new TypeError('Failed to fetch')
    await uploader.flush()
    sender.fail = () => undefined
    await uploader.flush() // e.g. the browser says it is back online
    expect(sender.sent).toEqual(['milk_name.wav'])
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS)
    expect(sender.sent).toEqual(['milk_name.wav'])
  })

  it('skips a clip the server refuses for good, and sends the rest', async () => {
    outbox.clips = [clip('milk_name.wav'), clip('eggs_name.wav')]
    sender.fail = (f) => (f === 'milk_name.wav' ? new ApiError(413, 'Clip too large') : undefined)
    await uploader.flush()
    expect(sender.sent).toEqual(['eggs_name.wav'])
    expect(last()).toEqual({ state: 'idle', pending: 0, failed: 1 })

    // Not tried again on the next pass...
    sender.fail = () => undefined
    await uploader.flush()
    expect(sender.sent).toEqual(['eggs_name.wav'])

    // ...but a new take of the same phrase is.
    outbox.clips[0] = clip('milk_name.wav', 2)
    await uploader.flush()
    expect(sender.sent).toEqual(['eggs_name.wav', 'milk_name.wav'])
  })

  it('stops for good when the link is revoked', async () => {
    outbox.clips = [clip('milk_name.wav'), clip('eggs_name.wav')]
    sender.fail = () => new ApiError(401, 'Unknown or revoked link')
    await uploader.flush()
    expect(last()).toEqual({ state: 'revoked', pending: 2, failed: 0 })

    sender.fail = () => undefined
    await uploader.flush()
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS * 2)
    expect(sender.sent).toEqual([])
  })

  it('cancels a waiting retry when stopped', async () => {
    outbox.clips = [clip('milk_name.wav')]
    sender.fail = () => new TypeError('Failed to fetch')
    await uploader.flush()
    uploader.stop()
    sender.fail = () => undefined
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS)
    expect(sender.sent).toEqual([])
  })
})
