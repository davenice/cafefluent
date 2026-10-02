// Splits a continuous stream of audio frames into clips, one per utterance,
// using the level of each frame relative to the measured background noise.
//
// The detector only sees one level (dBFS) per frame and works in frame indices;
// the caller keeps the audio itself and cuts it with the indices it returns.

export interface DetectorSettings {
  /** dB above the noise floor that starts a clip. */
  onsetDb: number
  /** dB above the noise floor that still counts as speech once a clip has started. */
  releaseDb: number
  /** How long the level must stay above onset before it counts as speech, not a click. */
  minOnsetMs: number
  /** Silence that ends a clip. Must be longer than the pause at a comma. */
  endSilenceMs: number
  /** Clips with less speech than this are dropped (a cough, a knock). */
  minSpeechMs: number
  /** A clip still going after this long is treated as background noise. */
  maxClipMs: number
  /** Audio kept before the detected start, so quiet first sounds (f, s, h) are not cut. */
  preRollMs: number
  /** Audio kept after the last loud frame, so word endings fade naturally. */
  tailMs: number
  /** Background level (dBFS) above which recording stops: the quiet-room benchmark. */
  quietLimitDb: number
}

export const DEFAULT_SETTINGS: DetectorSettings = {
  onsetDb: 15,
  releaseDb: 10,
  minOnsetMs: 60,
  endSilenceMs: 2000,
  minSpeechMs: 250,
  maxClipMs: 10000,
  preRollMs: 300,
  tailMs: 300,
  quietLimitDb: -40,
}

// A very clean input can measure near digital silence, which would put the
// speech threshold low enough for breathing to trigger it.
const MIN_FLOOR_DB = -70

// How quickly the background estimate follows the room, in ms.
const AMBIENT_TIME_CONSTANT_MS = 1000

export type DetectorEvent =
  | { type: 'none' }
  | { type: 'speech-start' }
  | { type: 'clip'; startFrame: number; endFrame: number }
  | { type: 'discard' }
  | { type: 'too-long' }
  | { type: 'noisy'; ambientDb: number }

export function levelDb(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  const rms = Math.sqrt(sum / samples.length)
  return 20 * Math.log10(Math.max(rms, 1e-10))
}

/** Background level from a run of frame levels: the mean power, in dB. */
export function noiseFloorDb(levels: number[]): number {
  if (levels.length === 0) return -Infinity
  const meanPower = levels.reduce((sum, db) => sum + 10 ** (db / 10), 0) / levels.length
  return 10 * Math.log10(meanPower)
}

export class SegmentDetector {
  private readonly floor: number
  private frame = -1
  private speaking = false
  private loudRun = 0
  private speechStart = 0
  private lastLoud = 0
  private speechFrames = 0
  private ambientDb: number
  private readonly frameMs: number
  private readonly settings: DetectorSettings

  constructor(floorDb: number, frameMs: number, settings: DetectorSettings = DEFAULT_SETTINGS) {
    this.frameMs = frameMs
    this.settings = settings
    this.floor = Math.max(floorDb, MIN_FLOOR_DB)
    this.ambientDb = floorDb
  }

  get isSpeaking(): boolean {
    return this.speaking
  }

  /** Frames the caller must keep while idle so the pre-roll is available. */
  get framesToKeep(): number {
    return this.ms(this.settings.preRollMs) + this.ms(this.settings.minOnsetMs) + 1
  }

  /** Drop any clip in progress, e.g. when the speaker pauses or goes back. */
  reset(): void {
    this.speaking = false
    this.loudRun = 0
    this.ambientDb = this.floor
  }

  /** Feed the level of the next frame. Returns what, if anything, just happened. */
  push(db: number): DetectorEvent {
    this.frame++
    const s = this.settings
    const loud = db >= this.floor + (this.speaking ? s.releaseDb : s.onsetDb)

    if (!this.speaking) {
      if (!loud) {
        this.loudRun = 0
        const k = this.frameMs / AMBIENT_TIME_CONSTANT_MS
        this.ambientDb = this.ambientDb + k * (db - this.ambientDb)
        if (this.ambientDb > s.quietLimitDb) return { type: 'noisy', ambientDb: this.ambientDb }
        return { type: 'none' }
      }
      this.loudRun++
      if (this.loudRun < this.ms(s.minOnsetMs)) return { type: 'none' }
      this.speaking = true
      this.speechStart = this.frame - this.loudRun + 1
      this.lastLoud = this.frame
      this.speechFrames = this.loudRun
      this.loudRun = 0
      return { type: 'speech-start' }
    }

    if (loud) {
      this.lastLoud = this.frame
      this.speechFrames++
    }
    if ((this.frame - this.speechStart) * this.frameMs > s.maxClipMs) {
      this.speaking = false
      return { type: 'too-long' }
    }
    if ((this.frame - this.lastLoud) * this.frameMs < s.endSilenceMs) return { type: 'none' }

    this.speaking = false
    if (this.speechFrames * this.frameMs < s.minSpeechMs) return { type: 'discard' }
    return {
      type: 'clip',
      startFrame: Math.max(0, this.speechStart - this.ms(s.preRollMs)),
      endFrame: Math.min(this.frame, this.lastLoud + this.ms(s.tailMs)),
    }
  }

  /** A duration in ms as a whole number of frames, rounded up. */
  private ms(duration: number): number {
    return Math.ceil(duration / this.frameMs)
  }
}
