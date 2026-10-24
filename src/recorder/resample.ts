// Sample-rate conversion, which needs the browser's audio engine. It lives
// apart from wav.ts so that module stays plain arithmetic: the scripts that
// read and rewrite the saved clips in Node import it (see scripts/wav.ts).

/** Convert to another sample rate using the browser's own resampler. */
export async function resample(samples: Float32Array, fromRate: number, toRate: number): Promise<Float32Array> {
  if (fromRate === toRate) return samples
  const ctx = new OfflineAudioContext(1, Math.ceil((samples.length * toRate) / fromRate), toRate)
  const buffer = ctx.createBuffer(1, samples.length, fromRate)
  buffer.getChannelData(0).set(samples)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start()
  return (await ctx.startRendering()).getChannelData(0)
}
