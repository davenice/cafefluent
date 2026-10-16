// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanRecordings, wavStats } from './reviewRecordings'

const RATE = 22050

/** A mono 16-bit WAV, like the recorder makes. */
function wav(samples: Float32Array, rate = RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const str = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.round(s * 0x7fff), true))
  return bytes
}

/** `seconds` of a tone at `level` (1 = full scale), with silence either side. */
function tone({ level = 1, seconds = 1, before = 0, after = 0 }): Float32Array {
  const samples = new Float32Array(Math.round((before + seconds + after) * RATE))
  const from = Math.round(before * RATE)
  for (let i = from; i < from + Math.round(seconds * RATE); i++) samples[i] = level * Math.sin((i / RATE) * 2 * Math.PI * 200)
  return samples
}

describe('wavStats', () => {
  it('measures duration, peak and average level', () => {
    const stats = wavStats(wav(tone({ level: 0.5, seconds: 2 })))!
    expect(stats.durationMs).toBe(2000)
    expect(stats.peakDb).toBeCloseTo(-6, 0)
    // A sine's RMS is its peak over root two: about 3 dB below the peak.
    expect(stats.rmsDb).toBeCloseTo(-9, 0)
  })

  it('measures the silence before and after the words', () => {
    const stats = wavStats(wav(tone({ seconds: 1, before: 0.5, after: 0.25 })))!
    expect(stats.durationMs).toBe(1750)
    expect(stats.leadMs).toBeGreaterThanOrEqual(450)
    expect(stats.leadMs).toBeLessThanOrEqual(520)
    expect(stats.tailMs).toBeGreaterThanOrEqual(200)
    expect(stats.tailMs).toBeLessThanOrEqual(270)
  })

  it('calls a clip with nothing in it silent all through', () => {
    const stats = wavStats(wav(new Float32Array(RATE)))!
    expect(stats.leadMs).toBe(1000)
    expect(stats.tailMs).toBe(0)
    expect(stats.peakDb).toBeLessThan(-90)
  })

  it('reads a file with another chunk before the samples', () => {
    const plain = wav(tone({ level: 0.5, seconds: 1 }))
    const extra = new Uint8Array(plain.length + 12)
    extra.set(plain.subarray(0, 36))
    new DataView(extra.buffer).setUint32(4, extra.length - 8, true)
    // A 4-byte LIST chunk between fmt and data.
    ;[...'LIST'].forEach((c, i) => extra[36 + i] = c.charCodeAt(0))
    new DataView(extra.buffer).setUint32(40, 4, true)
    extra.set(plain.subarray(36), 48)
    expect(wavStats(extra)?.durationMs).toBe(1000)
  })

  it('returns null for anything that is not a 16-bit PCM wav', () => {
    expect(wavStats(new Uint8Array(10))).toBeNull()
    expect(wavStats(new TextEncoder().encode('RIFF....WAVEnonsense'))).toBeNull()
    const mp3Codec = wav(tone({ seconds: 1 }))
    new DataView(mp3Codec.buffer).setUint16(20, 85, true) // not PCM
    expect(wavStats(mp3Codec)).toBeNull()
  })
})

describe('scanRecordings', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'review-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const put = async (path: string, bytes: Uint8Array | string) => {
    await mkdir(join(dir, path, '..'), { recursive: true })
    await writeFile(join(dir, path), bytes)
  }

  it('lists every clip with its contributor, module and measurements', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav', wav(tone({ level: 0.5, seconds: 1 })))
    await put('sam-00ab12/bread/bap_name.wav', wav(tone({ level: 0.25, seconds: 1 })))

    const clips = await scanRecordings(dir)
    expect(clips.map((c) => [c.contributor, c.module, c.file])).toEqual([
      ['amira-3f9a1c', 'allergens', 'milk_name.wav'],
      ['sam-00ab12', 'bread', 'bap_name.wav'],
    ])
    expect(clips[0].durationMs).toBe(1000)
    expect(clips[0].peakDb).toBeGreaterThan(clips[1].peakDb)
    expect(clips[0].bytes).toBeGreaterThan(0)
    expect(clips[0].recorded).toMatch(/^\d{4}-/)
  })

  it('leaves out files that are not clips, and unreadable ones', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav', wav(tone({ seconds: 1 })))
    await put('amira-3f9a1c/allergens/notes.txt', 'ignore me')
    await put('amira-3f9a1c/allergens/Milk Name.wav', wav(tone({ seconds: 1 })))
    await put('amira-3f9a1c/allergens/broken_clip.wav', 'not a wav at all')
    await put('.DS_Store/allergens/milk_name.wav', wav(tone({ seconds: 1 })))

    expect((await scanRecordings(dir)).map((c) => c.file)).toEqual(['milk_name.wav'])
  })

  it('gives nothing when there are no recordings yet', async () => {
    expect(await scanRecordings(join(dir, 'nowhere'))).toEqual([])
  })
})
