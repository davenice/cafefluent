// Serves the review page everything it needs from disk: the clips in
// recordings/ with each one measured, the prepared copies in
// recordings-prepared/, and the decisions file it reads and writes.
//
// A dev-server plugin only: review.html is not part of the production build,
// and recordings/ is git-ignored and never deployed.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Connect, Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { clipKey, clipPath, clipRef, listVoices, scanRecordings, type Clip } from './recordings.ts'
import { readManifest, type Manifest, type PreparedClip } from './prepareRecordings.ts'
import {
  applyPatch,
  emptyDecisions,
  parseDecisions,
  parsePatch,
  renameVoices,
  serialiseDecisions,
  voiceAliases,
  type Decisions,
} from '../src/review/decisions.ts'

/** A request body big enough for the whole export manifest, and no bigger. */
const MAX_BODY = 8 * 1024 * 1024

export interface ReviewClip extends Clip {
  /** What the prepare step made of it, when it has been run. */
  prepared?: PreparedClip
}

export interface ReviewState {
  clips: ReviewClip[]
  /** When the prepare step last ran and what it did, or null if it hasn't. */
  prepared: { at: string; recipe: Manifest['recipe'] } | null
  decisions: Decisions
}

/** Everything the page loads in one go: clips, what prepare did, and the decisions. */
export async function reviewState({
  dir,
  preparedDir,
  decisionsFile,
}: {
  dir: string
  preparedDir: string
  decisionsFile: string
}): Promise<ReviewState> {
  const [clips, manifest, decisions] = await Promise.all([
    scanRecordings(dir),
    readManifest(preparedDir),
    // Loading the page is also when a file still holding names is written back
    // without them, so one load after fetching new voices is enough to clean it.
    loadDecisions({ dir, decisionsFile, rewrite: true }),
  ])
  return {
    clips: clips.map((clip) => {
      const prepared = manifest?.clips[clipKey(clip)]
      return prepared ? { ...clip, prepared } : clip
    }),
    prepared: manifest ? { at: manifest.prepared, recipe: manifest.recipe } : null,
    decisions,
  }
}

/**
 * The decisions as the page wants them, with each voice under its contributor
 * id. The file holds the six characters alone, so a name is never committed;
 * with `rewrite`, a file that still has names in it is written back without them.
 */
export async function loadDecisions({
  dir,
  decisionsFile,
  rewrite = false,
}: {
  dir: string
  decisionsFile: string
  rewrite?: boolean
}): Promise<Decisions> {
  const [stored, { expand, collapse }] = await Promise.all([readDecisions(decisionsFile), aliases(dir)])
  if (rewrite) {
    const named = serialiseDecisions(renameVoices(stored, collapse))
    if (named !== serialiseDecisions(stored)) await writeDecisions(decisionsFile, renameVoices(stored, collapse))
  }
  return renameVoices(stored, expand)
}

/** Apply one change from the page and save it, answering with the decisions as they now stand. */
export async function saveDecision({
  dir,
  decisionsFile,
  patch,
}: {
  dir: string
  decisionsFile: string
  patch: Parameters<typeof applyPatch>[1]
}): Promise<Decisions> {
  const { expand, collapse } = await aliases(dir)
  // Read, apply and write together, so the file stays the record even after it
  // is edited by hand between one decision and the next.
  const stored = await readDecisions(decisionsFile)
  const decided = applyPatch(renameVoices(stored, expand), patch)
  await writeDecisions(decisionsFile, renameVoices(decided, collapse))
  return decided
}

const aliases = async (dir: string) => voiceAliases(await listVoices(dir))

/** The decisions file as it is stored, or empty decisions when there isn't one yet. */
export async function readDecisions(file: string): Promise<Decisions> {
  const text = await readFile(file, 'utf8').catch(() => null)
  if (text === null) return emptyDecisions()
  try {
    return parseDecisions(JSON.parse(text))
  } catch {
    // A file we can't read is not a file to overwrite: say so instead.
    throw new Error(`${file} is not valid JSON. Fix or delete it.`)
  }
}

export async function writeDecisions(file: string, decisions: Decisions): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, serialiseDecisions(decisions))
}

export interface ReviewPaths {
  dir: string
  preparedDir: string
  decisionsFile: string
  exportFile: string
}

/**
 * `GET  /recordings-api/review.json`   the clips, the prepared stats and the decisions
 * `POST /recordings-api/decisions`     apply one change and save; answers with the decisions
 * `POST /recordings-api/export`        write the picked set as a manifest
 * `GET  /recordings/<contributor>/<module>/<file>.wav`   a clip as it was recorded
 * `GET  /prepared/<contributor>/<module>/<file>.wav`     its trimmed, levelled copy
 *
 * All only ever answered by the dev server; see README, "Reviewing the recordings".
 */
export function reviewMiddleware({ dir, preparedDir, decisionsFile, exportFile }: ReviewPaths): Connect.NextHandleFunction {
  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]
    const method = req.method ?? 'GET'

    if (path === '/recordings-api/review.json' && method === 'GET') {
      void answer(res, () => reviewState({ dir, preparedDir, decisionsFile }))
      return
    }

    if (path === '/recordings-api/decisions' && method === 'POST') {
      void answer(res, async () => {
        const patch = parsePatch(await readJsonBody(req))
        if (!patch) throw new BadRequest('Not a change I know how to make')
        return { decisions: await saveDecision({ dir, decisionsFile, patch }) }
      })
      return
    }

    if (path === '/recordings-api/export' && method === 'POST') {
      void answer(res, async () => {
        const body = (await readJsonBody(req)) as { picked?: unknown }
        if (!Array.isArray(body?.picked)) throw new BadRequest('An export needs a list of picks')
        await mkdir(dirname(exportFile), { recursive: true })
        await writeFile(exportFile, `${JSON.stringify({ exported: new Date().toISOString(), ...body }, null, 2)}\n`)
        return { file: exportFile, picked: body.picked.length }
      })
      return
    }

    const audio = path.startsWith('/recordings/')
      ? { from: dir, parts: path.slice('/recordings/'.length) }
      : path.startsWith('/prepared/')
        ? { from: preparedDir, parts: path.slice('/prepared/'.length) }
        : null
    if (audio) {
      // A key from the bucket is a path on disk here, so only serve what matches
      // the layout exactly: no traversal, no other file types.
      const ref = clipRef(audio.parts.split('/'))
      if (!ref) {
        res.statusCode = 404
        res.end('Not a clip')
        return
      }
      readFile(clipPath(audio.from, ref)).then(
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
}

/** Dev only: review.html is not in the production build. */
export function recordingsReview(paths: ReviewPaths): Plugin {
  return {
    name: 'recordings-review',
    apply: 'serve',
    configureServer: (server) => {
      server.middlewares.use(reviewMiddleware(paths))
    },
  }
}

/** A message for the page rather than something that went wrong on our side. */
class BadRequest extends Error {}

async function answer(res: ServerResponse, work: () => Promise<unknown>): Promise<void> {
  try {
    const body = await work()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(body))
  } catch (err) {
    res.statusCode = err instanceof BadRequest ? 400 : 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: (err as Error).message }))
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new BadRequest('That request is too big')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
  } catch {
    throw new BadRequest('That request is not JSON')
  }
}
