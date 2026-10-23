#!/usr/bin/env node
/**
 * Trim the silence off every downloaded clip and bring it to the standard
 * level, writing a second copy beside the originals.
 *
 * Usage:
 *   node scripts/prepareRecordings.ts [--force]
 *
 * --force  Re-do every clip, not just the new and changed ones.
 *
 * Input:   recordings/<contributor>/<module>/<item>_<variant>.wav   (npm run fetch:recordings)
 * Output:  recordings-prepared/<same path>, plus prepared.json listing what was done
 *
 * Deliberately not part of fetch-recordings: that skips a download by comparing
 * the local file's size and time against the object in S3, which a processed
 * file would never match, so every run would download everything again. Keeping
 * the originals also means the trim rule can change without re-downloading, and
 * there is still something to go back to when a trim cuts a word short.
 *
 * The review page plays these copies, so what you pick between is what the app
 * would get (see README, "Reviewing the recordings").
 */

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clipKey, clipPath, listClips, type ClipRef } from './recordings.ts'
import { prepareClip, RECIPE, type ClipStats } from './wav.ts'

export const MANIFEST = 'prepared.json'

export interface PreparedClip extends ClipStats {
  /** Gain applied, in dB, and the silence taken off each end, in ms. */
  gainDb: number
  cutLeadMs: number
  cutTailMs: number
  /** Set when the clip was left untrimmed because there was no speech to trim to. */
  note?: string
  /** The original this was made from, so a re-recorded clip is prepared again. */
  source: { bytes: number; recorded: string }
}

export interface Manifest {
  /** When the folder was last written. */
  prepared: string
  /** What was done. A change here re-does every clip. */
  recipe: typeof RECIPE
  /** Keyed by `contributor/module/file`. */
  clips: Record<string, PreparedClip>
}

export function emptyManifest(): Manifest {
  return { prepared: new Date().toISOString(), recipe: RECIPE, clips: {} }
}

/**
 * The manifest in `outDir`, or null if there isn't a usable one. A manifest
 * written by a different recipe is no use: its clips don't match what this
 * version of prepareClip would make.
 */
export async function readManifest(outDir: string): Promise<Manifest | null> {
  const text = await readFile(join(outDir, MANIFEST), 'utf8').catch(() => null)
  if (text === null) return null
  try {
    const manifest = JSON.parse(text) as Manifest
    if (!manifest?.clips || typeof manifest.clips !== 'object') return null
    return manifest
  } catch {
    return null
  }
}

export function sameRecipe(manifest: Manifest | null): boolean {
  return JSON.stringify(manifest?.recipe) === JSON.stringify(RECIPE)
}

export interface PrepareResult {
  prepared: number
  skipped: number
  /** Clips that aren't readable WAVs. */
  failed: string[]
  /** Prepared copies of recordings that are no longer there. */
  removed: number
  /** True when everything was done again, because of --force or a new recipe. */
  redidAll: boolean
  /** True when the folder was made by an older recipe than this one. */
  recipeChanged: boolean
  manifest: Manifest
}

/** Prepare every clip in `dir` that needs it, into `outDir`. */
export async function prepareRecordings({
  dir,
  outDir,
  force = false,
  log = () => {},
}: {
  dir: string
  outDir: string
  force?: boolean
  log?: (message: string) => void
}): Promise<PrepareResult> {
  const previous = await readManifest(outDir)
  const recipeChanged = previous !== null && !sameRecipe(previous)
  const redidAll = force || recipeChanged
  const old = redidAll ? {} : (previous?.clips ?? {})
  const manifest = emptyManifest()
  const result: PrepareResult = { prepared: 0, skipped: 0, failed: [], removed: 0, redidAll, recipeChanged, manifest }

  const seen = new Set<string>()
  for (const ref of await listClips(dir)) {
    const key = clipKey(ref)
    seen.add(key)
    const source = await stat(clipPath(dir, ref))
    const was = old[key]
    const unchanged =
      was && was.source.bytes === source.size && was.source.recorded === source.mtime.toISOString()
    if (unchanged && (await exists(clipPath(outDir, ref)))) {
      manifest.clips[key] = was
      result.skipped++
      continue
    }

    const prepared = prepareClip(await readFile(clipPath(dir, ref)))
    if (!prepared) {
      log(`Could not read ${key}`)
      result.failed.push(key)
      continue
    }
    const out = clipPath(outDir, ref)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, prepared.bytes)
    manifest.clips[key] = {
      ...prepared.stats,
      gainDb: prepared.gainDb,
      cutLeadMs: prepared.cutLeadMs,
      cutTailMs: prepared.cutTailMs,
      ...(prepared.note ? { note: prepared.note } : {}),
      source: { bytes: source.size, recorded: source.mtime.toISOString() },
    }
    result.prepared++
  }

  // A prepared copy of a recording that has gone is only confusing: the folder
  // is derived, so nothing is lost by taking it out.
  for (const key of Object.keys(old)) {
    if (seen.has(key)) continue
    const [contributor, module, file] = key.split('/')
    await rm(clipPath(outDir, { contributor, module, file } as ClipRef), { force: true })
    result.removed++
  }

  manifest.clips = sortKeys(manifest.clips)
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  return result
}

function sortKeys(clips: Record<string, PreparedClip>): Record<string, PreparedClip> {
  return Object.fromEntries(Object.entries(clips).sort(([a], [b]) => a.localeCompare(b)))
}

const exists = (path: string) => stat(path).then(() => true, () => false)

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const dir = join(root, 'recordings')
  const outDir = join(root, 'recordings-prepared')
  const force = process.argv.includes('--force')

  const result = await prepareRecordings({ dir, outDir, force, log: console.warn })
  const clips = Object.values(result.manifest.clips)
  if (clips.length === 0) {
    console.log(`No clips in ${dir}. Run npm run fetch:recordings first.`)
    return
  }
  if (result.recipeChanged) console.log('The recipe changed, so every clip was prepared again.')

  const cut = clips.reduce((total, c) => total + c.cutLeadMs + c.cutTailMs, 0)
  console.log(`${result.prepared} prepared, ${result.skipped} already up to date, ${result.removed} no longer recorded`)
  console.log(`Trimmed ${(cut / 1000).toFixed(1)}s of silence in total, ${Math.round(cut / clips.length)}ms a clip on average`)

  const silent = clips.filter((c) => c.note)
  // The level leaves headroom for the loudest 1% of samples and no more, so a
  // clip with a sharper peak than that has its loudest moments clamped. The
  // recorder does the same thing to the clip it saves; it is worth knowing how
  // often, not worth quietening every clip to avoid.
  const atLimit = clips.filter((c) => c.peakDb > -0.5)
  const capped = clips.filter((c) => c.gainDb >= RECIPE.maxGainDb - 0.1)
  if (silent.length) console.log(`${silent.length} clip${silent.length === 1 ? ' has' : 's have'} no words in: not trimmed`)
  if (atLimit.length) console.log(`${atLimit.length} peak at the limit: their loudest moments are clamped`)
  if (capped.length) console.log(`${capped.length} still under the target after the most gain we allow (${RECIPE.maxGainDb} dB)`)
  if (result.failed.length) console.log(`${result.failed.length} could not be read`)
  console.log(`Saved to ${outDir}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: Error) => {
    console.error(err.message)
    process.exit(1)
  })
}
