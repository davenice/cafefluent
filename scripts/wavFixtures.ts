// WAV test fixtures, used by the tests for wav.ts, recordings.ts and
// prepareRecordings.ts. Not used by anything that runs for real.

export const RATE = 22050

/** A mono 16-bit WAV, like the recorder makes. */
export function wav(samples: Float32Array, rate = RATE): Uint8Array {
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
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff), true))
  return bytes
}

/** `seconds` of a tone at `level` (1 = full scale), with silence either side. */
export function tone({ level = 1, seconds = 1, before = 0, after = 0 }): Float32Array {
  const samples = new Float32Array(Math.round((before + seconds + after) * RATE))
  const from = Math.round(before * RATE)
  for (let i = from; i < from + Math.round(seconds * RATE); i++) samples[i] = level * Math.sin((i / RATE) * 2 * Math.PI * 200)
  return samples
}
