// Serves the clips in recordings/ to the review page, with each one measured.
// A dev-server plugin only: review.html is not part of the production build, and
// recordings/ is git-ignored and never deployed.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Connect, Plugin } from 'vite'

/** The layout fetch-recordings writes: recordings/<contributor>/<module>/<item>_<variant>.wav */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const CLIP_FILE = /^[a-z0-9]+(-[a-z0-9]+)*_[a-z0-9]+(-[a-z0-9]+)*\.wav$/

/** Anything quieter than this counts as silence when measuring the ends. */
const SILENCE_DB = -45
const WINDOW_MS = 20

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

export interface Clip extends ClipStats {
  contributor: string
  module: string
  file: string
  bytes: number
  /** When it was recorded, from the file's time (fetch-recordings sets it from S3). */
  recorded: string
}

const db = (level: number) => 20 * Math.log10(Math.max(level, 1e-10))
const round = (n: number) => Math.round(n * 10) / 10

/**
 * Measure a 16-bit PCM WAV, the only kind the recorder makes (see src/recorder/wav.ts).
 * Returns null for anything else, so one odd file doesn't stop the listing.
 */
export function wavStats(bytes: Uint8Array): ClipStats | null {
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

  // Mono-sum first, so a stereo file measures the same as the mono one we expect.
  const window = Math.max(1, Math.round((sampleRate * WINDOW_MS) / 1000))
  const quiet = 10 ** (SILENCE_DB / 20)
  let peak = 0
  let sumOfSquares = 0
  let windowSquares = 0
  let firstLoud = -1
  let lastLoud = -1
  for (let f = 0; f < frames; f++) {
    let sample = 0
    for (let c = 0; c < channels; c++) sample += view.getInt16(data.at + (f * channels + c) * 2, true) / 0x8000
    sample /= channels
    peak = Math.max(peak, Math.abs(sample))
    sumOfSquares += sample * sample
    windowSquares += sample * sample
    if (f % window === window - 1 || f === frames - 1) {
      const windowed = Math.sqrt(windowSquares / window)
      if (windowed > quiet) {
        if (firstLoud < 0) firstLoud = f + 1 - window
        lastLoud = f + 1
      }
      windowSquares = 0
    }
  }

  const ms = (f: number) => Math.round((f / sampleRate) * 1000)
  return {
    durationMs: ms(frames),
    peakDb: round(db(peak)),
    rmsDb: round(db(Math.sqrt(sumOfSquares / frames))),
    leadMs: firstLoud < 0 ? ms(frames) : ms(firstLoud),
    tailMs: lastLoud < 0 ? 0 : ms(frames - lastLoud),
  }
}

/** Every clip under `dir`, measured. Files that aren't clips are left out. */
export async function scanRecordings(dir: string): Promise<Clip[]> {
  const clips: Clip[] = []
  for (const contributor of await listDir(dir)) {
    if (!SLUG.test(contributor)) continue
    for (const module of await listDir(join(dir, contributor))) {
      if (!SLUG.test(module)) continue
      for (const file of await listDir(join(dir, contributor, module))) {
        if (!CLIP_FILE.test(file)) continue
        const path = join(dir, contributor, module, file)
        const [info, bytes] = await Promise.all([stat(path), readFile(path)])
        const stats = wavStats(bytes)
        if (!stats) continue
        clips.push({ contributor, module, file, bytes: info.size, recorded: info.mtime.toISOString(), ...stats })
      }
    }
  }
  return clips.sort((a, b) => `${a.contributor}/${a.module}/${a.file}`.localeCompare(`${b.contributor}/${b.module}/${b.file}`))
}

async function listDir(path: string): Promise<string[]> {
  return (await readdir(path, { withFileTypes: true }).catch(() => [])).map((e) => e.name).sort()
}

/**
 * `GET /recordings-api/clips.json` lists every local clip, and
 * `GET /recordings/<contributor>/<module>/<file>.wav` plays one. Both are only
 * ever answered by the dev server; see README, "Reviewing the recordings".
 */
export function recordingsReview({ dir }: { dir: string }): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]
    if (path === '/recordings-api/clips.json') {
      scanRecordings(dir).then(
        (clips) => {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ clips }))
        },
        (err: Error) => {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        },
      )
      return
    }
    if (path.startsWith('/recordings/')) {
      // A key from the bucket is a path on disk here, so only serve what matches
      // the layout exactly: no traversal, no other file types.
      const [contributor, module, file, ...rest] = path.slice('/recordings/'.length).split('/')
      if (rest.length || !SLUG.test(contributor ?? '') || !SLUG.test(module ?? '') || !CLIP_FILE.test(file ?? '')) {
        res.statusCode = 404
        res.end('Not a clip')
        return
      }
      readFile(join(dir, contributor, module, file)).then(
        (bytes) => {
          res.setHeader('Content-Type', 'audio/wav')
          res.setHeader('Cache-Control', 'no-store')
          res.end(bytes)
        },
        () => {
          res.statusCode = 404
          res.end('No such clip')
        },
      )
      return
    }
    next()
  }

  return {
    name: 'recordings-review',
    apply: 'serve',
    configureServer: (server) => {
      server.middlewares.use(middleware)
    },
  }
}
