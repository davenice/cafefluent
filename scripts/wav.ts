// Reading and rewriting the saved clips from Node: measuring one for the review
// page, and making the trimmed, level-matched copy that review listens to and
// the import step will convert (scripts/prepareRecordings.ts).
//
// The levels come from src/recorder/wav.ts, the same code the recorder uses in
// the browser, so a clip prepared here lands where the recorder was aiming.

import { applyGain, encodeWav, loudLevelDb, normaliseGainDb, MAX_GAIN_DB, NORMALISE_TARGET_DB } from '../src/recorder/wav.ts'

/**
 * Anything quieter than this counts as silence when finding the ends of the
 * words. It is measured after the clip has been brought to the standard level,
 * so it means the same thing on every microphone: see prepareClip.
 */
export const SILENCE_DB = -45
export const WINDOW_MS = 20

/**
 * Silence left either side of the words when trimming. Speech that starts the
 * moment a clip does sounds clipped, and the detector's threshold cuts the
 * quiet beginning of a word like an 'f' or an 's', which this puts back.
 */
export const PAD_MS = 120

/** Less speech than this in a clip means we found none, so it is left alone. */
export const MIN_SPEECH_MS = 50

/** What prepareClip does, stamped into the manifest so a change re-does every clip. */
export const RECIPE = {
  order: 'level, find the words, trim, level again',
  targetDb: NORMALISE_TARGET_DB,
  maxGainDb: MAX_GAIN_DB,
  silenceDb: SILENCE_DB,
  windowMs: WINDOW_MS,
  padMs: PAD_MS,
}

export interface Sound {
  /** Mono, -1 to 1. A stereo file is summed, so it measures like the mono one we expect. */
  samples: Float32Array
  sampleRate: number
}

export interface ClipStats {
  durationMs: number
  /** Loudest sample, in dBFS. Above about -0.5 the recording may be clipped. */
  peakDb: number
  /** Average level over the clip, in dBFS: how loud it actually sounds. */
  rmsDb: number
  /** Silence before the first sound and after the last, in ms. */
  leadMs: number
  tailMs: number
}

const db = (level: number) => 20 * Math.log10(Math.max(level, 1e-10))
const round = (n: number) => Math.round(n * 10) / 10

/**
 * Decode a 16-bit PCM WAV, the only kind the recorder makes (see
 * src/recorder/wav.ts). Returns null for anything else, so one odd file doesn't
 * stop the listing.
 */
export function decodeWav(bytes: Uint8Array): Sound | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (bytes.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null

  // Walk the chunks rather than assuming the 44-byte header: other tools write
  // LIST or fact chunks before the samples.
  let channels = 0
  let sampleRate = 0
  let bits = 0
  let format = 0
  let data: { at: number; size: number } | null = null
  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const id = tag(at)
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (id === 'fmt ' && size >= 16) {
      format = view.getUint16(body, true)
      channels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bits = view.getUint16(body + 14, true)
    } else if (id === 'data') {
      data = { at: body, size: Math.min(size, bytes.byteLength - body) }
    }
    at = body + size + (size % 2) // chunks are padded to an even length
  }
  if (format !== 1 || bits !== 16 || channels < 1 || !sampleRate || !data) return null

  const frames = Math.floor(data.size / 2 / channels)
  if (!frames) return null

  const samples = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sample = 0
    for (let c = 0; c < channels; c++) sample += view.getInt16(data.at + (f * channels + c) * 2, true) / 0x8000
    samples[f] = sample / channels
  }
  return { samples, sampleRate }
}

interface Scan {
  peak: number
  rms: number
  /** First and last frame of speech, or -1 either side of a clip with none. */
  firstLoud: number
  lastLoud: number
}

/** Peak, average, and where the words start and end, in one pass. */
function scan({ samples, sampleRate }: Sound): Scan {
  const window = Math.max(1, Math.round((sampleRate * WINDOW_MS) / 1000))
  const quiet = 10 ** (SILENCE_DB / 20)
  let peak = 0
  let sumOfSquares = 0
  let windowSquares = 0
  let firstLoud = -1
  let lastLoud = -1
  for (let f = 0; f < samples.length; f++) {
    const sample = samples[f]
    peak = Math.max(peak, Math.abs(sample))
    sumOfSquares += sample * sample
    windowSquares += sample * sample
    if (f % window === window - 1 || f === samples.length - 1) {
      if (Math.sqrt(windowSquares / window) > quiet) {
        if (firstLoud < 0) firstLoud = f + 1 - window
        lastLoud = f + 1
      }
      windowSquares = 0
    }
  }
  return { peak, rms: Math.sqrt(sumOfSquares / samples.length), firstLoud, lastLoud }
}

export function statsOf(sound: Sound): ClipStats {
  const { peak, rms, firstLoud, lastLoud } = scan(sound)
  const frames = sound.samples.length
  const ms = (f: number) => Math.round((f / sound.sampleRate) * 1000)
  return {
    durationMs: ms(frames),
    peakDb: round(db(peak)),
    rmsDb: round(db(rms)),
    leadMs: firstLoud < 0 ? ms(frames) : ms(firstLoud),
    tailMs: lastLoud < 0 ? 0 : ms(frames - lastLoud),
  }
}

/** Measure a saved clip. Null if it isn't a 16-bit PCM WAV. */
export function wavStats(bytes: Uint8Array): ClipStats | null {
  const sound = decodeWav(bytes)
  return sound && statsOf(sound)
}

export interface Prepared {
  /** A 16-bit mono WAV, trimmed and brought to the standard level. */
  bytes: Uint8Array
  /** Gain applied, in dB: positive for a clip lifted towards the target. */
  gainDb: number
  /** Silence taken off each end, in ms. */
  cutLeadMs: number
  cutTailMs: number
  /** Why nothing was trimmed, when nothing was: there is no speech to trim to. */
  note?: string
  /** The prepared clip's own measurements. */
  stats: ClipStats
}

/**
 * Trim the silence off a clip and bring it to the standard level.
 *
 * The level comes first, before anything is measured: the silence threshold is a
 * fixed level, and on a microphone that applies no gain of its own a whole clip
 * can sit below it, so looking for the words in the recording as it arrived
 * found no words at all in the quietest voices we have. Bringing every clip to
 * the same level first makes the threshold mean the same thing on all of them.
 *
 * The words are then found in that lifted copy, but cut out of the original, and
 * the level is measured again on what is left: `loudLevelDb` ignores the loudest
 * 1% of samples, so trimming moves it a little, and the clip we keep should be
 * measured as the clip we keep.
 *
 * Both gains are applied to the floats, before the 16-bit conversion, so lifting
 * a quiet recording doesn't bring quantisation noise up with it.
 *
 * A clip with no words in it even once lifted is levelled but never trimmed to
 * nothing, so a failed recording still shows up in review as something you can
 * listen to and mark bad.
 */
export function prepareClip(bytes: Uint8Array): Prepared | null {
  const sound = decodeWav(bytes)
  if (!sound) return null
  const { samples, sampleRate } = sound
  const frames = (ms: number) => Math.round((sampleRate * ms) / 1000)

  const lifted = applyGain(samples, normaliseGainDb(samples))
  const { firstLoud, lastLoud } = scan({ samples: lifted, sampleRate })

  const speech = firstLoud < 0 ? 0 : lastLoud - firstLoud
  const hasSpeech = speech >= frames(MIN_SPEECH_MS)
  const from = hasSpeech ? Math.max(0, firstLoud - frames(PAD_MS)) : 0
  const to = hasSpeech ? Math.min(samples.length, lastLoud + frames(PAD_MS)) : samples.length

  const trimmed = from === 0 && to === samples.length ? samples : samples.slice(from, to)
  const gainDb = round(normaliseGainDb(trimmed))
  const out = new Uint8Array(encodeWav(applyGain(trimmed, gainDb), sampleRate))
  const ms = (f: number) => Math.round((f / sampleRate) * 1000)
  return {
    bytes: out,
    gainDb,
    cutLeadMs: ms(from),
    cutTailMs: ms(samples.length - to),
    ...(hasSpeech ? {} : { note: 'no words found' }),
    // Measured by reading back what was written, not the floats it came from:
    // the target leaves headroom for the loudest 1%, and encodeWav clamps
    // whatever still goes over, so the file can peak lower than the maths says.
    stats: statsOf(decodeWav(out) ?? { samples: new Float32Array(), sampleRate }),
  }
}

/** How loud a clip is by the measure the level is set from. Exported for the tests. */
export { loudLevelDb }
