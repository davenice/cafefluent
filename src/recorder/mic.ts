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

const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    // The browser's speech processing would hide background noise from the
    // quiet check and change the level part-way through a clip.
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
}

export interface Mic {
  sampleRate: number
  /** Duration of one frame in ms. */
  frameMs: number
  onFrame: (samples: Float32Array) => void
  /** False once the audio has stopped: nothing will reach `onFrame` until revive(). */
  isLive: () => boolean
  /**
   * Start the audio again after the browser or the device stopped it. Call it
   * from a tap: resuming audio and opening the microphone both need a gesture
   * on some browsers. Permission is already given, so nothing is asked again.
   */
  revive: () => Promise<void>
  close: () => void
}

export async function openMic(): Promise<Mic> {
  let stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS)
  const ctx = new AudioContext()
  await ctx.resume()
  const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
  await ctx.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)

  const tap = new AudioWorkletNode(ctx, 'frame-tap')
  // Connected to a muted output so the browser keeps pulling audio through it.
  const mute = ctx.createGain()
  mute.gain.value = 0
  tap.connect(mute).connect(ctx.destination)
  let source = ctx.createMediaStreamSource(stream)
  source.connect(tap)

  // A track is muted while something else holds the microphone, and ends when
  // the device takes it away for good; the context is suspended whenever the
  // page is in the background, and on iOS while a call or an alarm interrupts
  // it. Nothing tells the page, so it has to look.
  const isLive = () =>
    ctx.state === 'running' && stream.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted)

  const mic: Mic = {
    sampleRate: ctx.sampleRate,
    frameMs: (FRAME_SIZE / ctx.sampleRate) * 1000,
    onFrame: () => {},
    isLive,
    revive: async () => {
      if (isLive()) return
      // A new stream on the same context, so the sample rate the session and
      // the detector were set up with doesn't change under them.
      stream.getTracks().forEach((t) => t.stop())
      stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS)
      source.disconnect()
      source = ctx.createMediaStreamSource(stream)
      source.connect(tap)
      await ctx.resume()
    },
    close: () => {
      tap.port.onmessage = null
      stream.getTracks().forEach((t) => t.stop())
      ctx.close()
    },
  }
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => mic.onFrame(e.data)
  return mic
}
