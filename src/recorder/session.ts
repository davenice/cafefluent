// Joins the microphone to the silence detector: keeps just enough audio to cut
// each clip, and reports what happens to the page.

import type { Mic } from './mic'
import { SegmentDetector, levelDb, noiseFloorDb, type DetectorSettings } from './detector'

export type SessionEvent =
  | { type: 'level'; db: number }
  | { type: 'speech-start' }
  | { type: 'clip'; samples: Float32Array; sampleRate: number }
  | { type: 'discard' }
  | { type: 'too-long' }
  | { type: 'noisy'; ambientDb: number }

/** Listen for `durationMs` and return the background level in dBFS. */
export function measureNoise(mic: Mic, durationMs: number, onLevel: (db: number) => void): Promise<number> {
  return new Promise((resolve) => {
    const levels: number[] = []
    const needed = Math.ceil(durationMs / mic.frameMs)
    mic.onFrame = (samples) => {
      const db = levelDb(samples)
      onLevel(db)
      levels.push(db)
      if (levels.length === needed) {
        mic.onFrame = () => {}
        resolve(noiseFloorDb(levels))
      }
    }
  })
}

export class RecordingSession {
  private readonly detector: SegmentDetector
  private frames: Float32Array[] = []
  private pushed = 0
  private paused = true
  private readonly mic: Mic
  private readonly onEvent: (event: SessionEvent) => void

  constructor(mic: Mic, floorDb: number, settings: DetectorSettings, onEvent: (event: SessionEvent) => void) {
    this.mic = mic
    this.onEvent = onEvent
    this.detector = new SegmentDetector(floorDb, mic.frameMs, settings)
    mic.onFrame = (samples) => this.handleFrame(samples)
  }

  get isPaused(): boolean {
    return this.paused
  }

  pause(): void {
    this.paused = true
    this.detector.reset()
    this.frames = []
  }

  resume(): void {
    this.detector.reset()
    this.frames = []
    this.paused = false
  }

  /** Throw away anything heard so far, e.g. when the phrase on screen changes. */
  restartClip(): void {
    this.detector.reset()
    this.frames = []
  }

  stop(): void {
    this.mic.onFrame = () => {}
  }

  private handleFrame(samples: Float32Array): void {
    const db = levelDb(samples)
    this.onEvent({ type: 'level', db })
    if (this.paused) return

    this.frames.push(samples)
    this.pushed++
    const event = this.detector.push(db)

    switch (event.type) {
      case 'speech-start':
      case 'discard':
      case 'too-long':
        this.onEvent(event)
        break
      case 'noisy':
        this.pause()
        this.onEvent(event)
        return
      case 'clip':
        this.onEvent({ type: 'clip', samples: this.cut(event.startFrame, event.endFrame), sampleRate: this.mic.sampleRate })
        break
    }

    if (!this.detector.isSpeaking && this.frames.length > this.detector.framesToKeep) {
      this.frames = this.frames.slice(-this.detector.framesToKeep)
    }
  }

  /** Join the kept frames between two absolute frame indices, inclusive. */
  private cut(startFrame: number, endFrame: number): Float32Array {
    // frames[0] is absolute frame (pushed - frames.length); the detector counts from 0.
    const first = this.pushed - this.frames.length
    const chunks = this.frames.slice(Math.max(0, startFrame - first), endFrame - first + 1)
    const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
    let offset = 0
    for (const c of chunks) {
      out.set(c, offset)
      offset += c.length
    }
    return out
  }
}
