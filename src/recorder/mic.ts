// Continuous raw microphone capture, delivered in fixed-size frames.
//
// MediaRecorder is no use here: its compressed chunks can't be cut at an exact
// sample, and we need to cut clips wherever the silence detector says.

const FRAME_SIZE = 1024

// Runs on the audio thread; batches the 128-sample render quanta into frames.
const WORKLET_SOURCE = `
class FrameTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${FRAME_SIZE}); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i]
        if (this.n === ${FRAME_SIZE}) {
          this.port.postMessage(this.buf, [this.buf.buffer])
          this.buf = new Float32Array(${FRAME_SIZE})
          this.n = 0
        }
      }
    }
    return true
  }
}
registerProcessor('frame-tap', FrameTap)
`

export interface Mic {
  sampleRate: number
  /** Duration of one frame in ms. */
  frameMs: number
  onFrame: (samples: Float32Array) => void
  close: () => void
}

export async function openMic(): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      // The browser's speech processing would hide background noise from the
      // quiet check and change the level part-way through a clip.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })
  const ctx = new AudioContext()
  await ctx.resume()
  const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
  await ctx.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)

  const source = ctx.createMediaStreamSource(stream)
  const tap = new AudioWorkletNode(ctx, 'frame-tap')
  // Connected to a muted output so the browser keeps pulling audio through it.
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(tap).connect(mute).connect(ctx.destination)

  const mic: Mic = {
    sampleRate: ctx.sampleRate,
    frameMs: (FRAME_SIZE / ctx.sampleRate) * 1000,
    onFrame: () => {},
    close: () => {
      tap.port.onmessage = null
      stream.getTracks().forEach((t) => t.stop())
      ctx.close()
    },
  }
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => mic.onFrame(e.data)
  return mic
}
