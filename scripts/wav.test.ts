// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { decodeWav, loudLevelDb, prepareClip, wavStats, PAD_MS, SILENCE_DB } from './wav.ts'
import { RATE, tone, wav } from './wavFixtures.ts'

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

describe('decodeWav', () => {
  it('gives back the samples and the rate', () => {
    const sound = decodeWav(wav(tone({ level: 0.5, seconds: 1 })))!
    expect(sound.sampleRate).toBe(RATE)
    expect(sound.samples.length).toBe(RATE)
    expect(Math.max(...sound.samples)).toBeCloseTo(0.5, 1)
  })
})

describe('prepareClip', () => {
  const prepare = (samples: Float32Array) => prepareClip(wav(samples))!

  it('trims the silence to the pad either side', () => {
    const prepared = prepare(tone({ level: 0.5, seconds: 1, before: 0.8, after: 0.6 }))
    expect(prepared.cutLeadMs).toBeGreaterThan(600)
    expect(prepared.cutTailMs).toBeGreaterThan(400)
    expect(prepared.stats.leadMs).toBeLessThanOrEqual(PAD_MS + 40)
    expect(prepared.stats.tailMs).toBeLessThanOrEqual(PAD_MS + 40)
    // A second of words, plus the pad at each end.
    expect(prepared.stats.durationMs).toBeGreaterThan(1000)
    expect(prepared.stats.durationMs).toBeLessThan(1000 + 4 * PAD_MS)
  })

  it('brings a quiet clip and a loud one to the same level', () => {
    const quiet = prepare(tone({ level: 0.02, seconds: 1, before: 0.5 }))
    const loud = prepare(tone({ level: 0.8, seconds: 1, before: 0.5 }))
    expect(quiet.gainDb).toBeGreaterThan(20)
    expect(loud.gainDb).toBeLessThan(0)
    expect(quiet.stats.rmsDb).toBeCloseTo(loud.stats.rmsDb, 0)
  })

  it('finds the words in a clip too quiet for the silence threshold to see', () => {
    // Every sample of this one is below SILENCE_DB, so looking for the words
    // before levelling it would find none at all. Still quiet enough that the
    // gain to reach the target is under the cap.
    const level = 10 ** ((SILENCE_DB - 3) / 20)
    const prepared = prepare(tone({ level, seconds: 1, before: 0.8 }))
    expect(prepared.note).toBeUndefined()
    expect(prepared.cutLeadMs).toBeGreaterThan(600)
    expect(loudLevelDb(decodeWav(prepared.bytes)!.samples)).toBeCloseTo(-8, 0)
  })

  it('leaves a clip with no words in it alone, and says so', () => {
    const prepared = prepare(new Float32Array(RATE))
    expect(prepared.note).toBe('no words found')
    expect(prepared.cutLeadMs).toBe(0)
    expect(prepared.cutTailMs).toBe(0)
    expect(prepared.stats.durationMs).toBe(1000)
  })

  it('measures what it wrote, so the stats match the file', () => {
    const prepared = prepare(tone({ level: 0.5, seconds: 1, before: 0.4 }))
    expect(wavStats(prepared.bytes)).toEqual(prepared.stats)
  })

  it('returns null for something that is not a wav', () => {
    expect(prepareClip(new TextEncoder().encode('not a wav'))).toBeNull()
  })
})
