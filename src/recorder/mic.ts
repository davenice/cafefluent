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

/** What the person has to change before the microphone will open, if anything. */
export type MicFix = 'allow' | 'system' | null

export interface MicProblem {
  /** What went wrong, in plain words. Says nothing about which button to press. */
  message: string
  fix: MicFix
}

/**
 * getUserMedia's own messages are written for developers ("Permission denied"),
 * and the same one covers a blocked page, a microphone another app is holding
 * and a device that isn't there. Say which it is, and whether a setting has to
 * change before trying again is any use.
 */
export function micProblem(e: unknown): MicProblem {
  // Read off the object rather than testing for Error: a DOMException thrown
  // in another realm, or by jsdom, doesn't always pass instanceof.
  const err = e as { name?: unknown; message?: unknown } | null | undefined
  const name = typeof err?.name === 'string' ? err.name : ''
  const detail = typeof err?.message === 'string' ? err.message : String(e)
  switch (name) {
    case 'NotAllowedError':
    // Chrome before 64 and some Android browsers.
    case 'PermissionDeniedError':
      // The microphone is off for the whole browser in the computer's own
      // settings. The page's setting is already yes, so changing it does
      // nothing, and the browser never asks again.
      if (/system/i.test(detail)) {
        return { message: 'Your computer is not letting this browser use the microphone.', fix: 'system' }
      }
      // The question was closed without an answer, so it gets asked again.
      if (/dismiss/i.test(detail)) {
        return { message: 'The microphone question was closed before you answered it.', fix: null }
      }
      return { message: 'This page is not allowed to use the microphone.', fix: 'allow' }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { message: 'No microphone was found. Plug one in, or turn it on in your computer’s sound settings.', fix: null }
    case 'NotReadableError':
    case 'TrackStartError':
      return { message: 'The microphone is busy. Close anything else using it, like a video call.', fix: null }
    case 'OverconstrainedError':
      return { message: 'This microphone cannot be used for recording. Try another one.', fix: null }
    case 'SecurityError':
      return { message: 'The microphone can’t be used on this page. Open your link again from the message you were sent.', fix: null }
    case 'AbortError':
      return { message: 'The microphone did not start.', fix: null }
  }
  return { message: detail || 'The microphone did not start.', fix: null }
}

/**
 * Whether the page has already been refused the microphone, so Start would
 * fail without asking. Undefined where the browser won't say — Firefox, and
 * Safari before 17 — and then the only way to find out is to open it.
 */
export async function micBlocked(): Promise<boolean | undefined> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state === 'denied'
  } catch {
    return undefined
  }
}
