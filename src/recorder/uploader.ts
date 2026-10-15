// Sends recorded clips to the server. Every clip is saved in the browser first
// (clipStore), so the browser is an outbox: a clip that can't be sent now, because
// the wifi dropped or the page was closed, is sent on the next try.

import { ApiError } from './api'
import type { StoredClip } from './clipStore'

export interface Outbox {
  /** Clips saved in the browser but not yet on the server. */
  pending(): Promise<StoredClip[]>
  markUploaded(clip: StoredClip): Promise<void>
}

export interface ClipSender {
  putClip(module: string, file: string, wav: ArrayBuffer): Promise<void>
}

export type UploadState =
  | 'idle'      // nothing left to send
  | 'sending'
  | 'waiting'   // offline or the server failed; trying again soon
  | 'revoked'   // the link no longer works; nothing more will be sent

export interface UploadStatus {
  state: UploadState
  /** Clips still to send, not counting any the server refused for good. */
  pending: number
  /** Clips the server refused for good (e.g. too large), so never sent. */
  failed: number
}

export const RETRY_MIN_MS = 5_000
export const RETRY_MAX_MS = 60_000

// The server refused this clip itself, so sending it again would fail again.
// 401 is handled separately: it means the whole link is dead.
const refusedForGood = (e: unknown) =>
  e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408 && e.status !== 429

// One take of one phrase. A take recorded again gets a new key, so it is tried
// even if the take before it was refused.
const takeKey = (c: StoredClip) => `${c.module}/${c.file}@${c.recordedAt}`

export class Uploader {
  private readonly outbox: Outbox
  private readonly sender: ClipSender
  private readonly onStatus: (status: UploadStatus) => void
  private running = false
  private again = false
  private stopped = false
  private retryMs = RETRY_MIN_MS
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly failed = new Set<string>()

  constructor(outbox: Outbox, sender: ClipSender, onStatus: (status: UploadStatus) => void) {
    this.outbox = outbox
    this.sender = sender
    this.onStatus = onStatus
  }

  /**
   * Send everything waiting. Safe to call often: a call made while sending adds
   * one more pass at the end, to pick up clips saved in the meantime.
   */
  async flush(): Promise<void> {
    if (this.stopped) return
    if (this.running) {
      this.again = true
      return
    }
    this.running = true
    clearTimeout(this.timer)
    try {
      do {
        this.again = false
        const pending = (await this.outbox.pending()).filter((c) => !this.failed.has(takeKey(c)))
        let left = pending.length
        this.report('sending', left)
        for (const clip of pending) {
          try {
            await this.sender.putClip(clip.module, clip.file, clip.wav)
            await this.outbox.markUploaded(clip)
            this.retryMs = RETRY_MIN_MS
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
              this.stop()
              this.report('revoked', left)
              return
            }
            if (!refusedForGood(e)) {
              this.report('waiting', left)
              this.timer = setTimeout(() => this.flush(), this.retryMs)
              this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS)
              return
            }
            this.failed.add(takeKey(clip))
          }
          this.report('sending', --left)
        }
      } while (this.again)
      this.report('idle', 0)
    } finally {
      this.running = false
    }
  }

  /** Stop sending, and cancel any retry waiting to run. */
  stop(): void {
    this.stopped = true
    clearTimeout(this.timer)
  }

  private report(state: UploadState, pending: number) {
    this.onStatus({ state, pending, failed: this.failed.size })
  }
}
