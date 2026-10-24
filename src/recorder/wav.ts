// 16-bit mono PCM WAV, and the levels that go with it. The import step
// converts to mp3 later, so we keep the recording lossless until then.
//
// Plain arithmetic, nothing from the browser: scripts/wav.ts reads and rewrites
// the saved clips in Node with the same functions, so a clip prepared offline
// comes out at the level the recorder was aiming for. Anything needing the
// audio engine goes in resample.ts.

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)            // fmt chunk size
  view.setUint16(20, 1, true)             // PCM
  view.setUint16(22, 1, true)             // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true)             // block align
  view.setUint16(34, 16, true)            // bits per sample
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

/** Loudest sample, in dBFS. 0 means the recording hit the limit and may be distorted. */
export function peakDb(samples: Float32Array): number {
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  return 20 * Math.log10(Math.max(peak, 1e-10))
}

/** The level a saved clip is brought to, in dBFS, measured as `loudLevelDb`. */
export const NORMALISE_TARGET_DB = -8

// Enough for a microphone that applies no gain of its own: a phone asked for
// unprocessed audio can come in 35–40 dB below the same words on another
// device. Not so much that a clip of nothing but room noise is lifted into
// something audible.
export const MAX_GAIN_DB = 45

/**
 * How loud a clip is, in dBFS, ignoring its loudest 1% of samples. A plain peak
 * would be set by one lip smack or a knock on the table; this sits about 5 dB
 * under the peak of speech and barely moves with a single transient, so it is
 * what the level is set by.
 */
export function loudLevelDb(samples: Float32Array): number {
  if (samples.length === 0) return -Infinity
  const magnitudes = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) magnitudes[i] = Math.abs(samples[i])
  magnitudes.sort()
  return 20 * Math.log10(Math.max(magnitudes[Math.floor(magnitudes.length * 0.99)], 1e-10))
}

/**
 * The gain (dB) that brings a clip to the standard level, so one speaker's
 * clips don't play back far quieter than another's. Negative for a clip that is
 * louder than the target. Apply it before encoding: the samples are still
 * floats there, so lifting a quiet recording costs nothing, while the same gain
 * applied after the 16-bit conversion would bring the quantisation noise with it.
 */
export function normaliseGainDb(samples: Float32Array): number {
  const level = loudLevelDb(samples)
  if (!Number.isFinite(level)) return 0
  return Math.min(NORMALISE_TARGET_DB - level, MAX_GAIN_DB)
}

/**
 * The samples with `gainDb` applied. The target leaves headroom for the 1% above
 * `loudLevelDb`, and encodeWav clamps anything that still goes over.
 */
export function applyGain(samples: Float32Array, gainDb: number): Float32Array {
  if (gainDb === 0) return samples
  const factor = 10 ** (gainDb / 20)
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * factor
  return out
}
