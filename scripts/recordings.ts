// The recordings folder: what fetch-recordings writes, how to walk it, and how
// to measure what is in it. Shared by the review dev server
// (scripts/reviewRecordings.ts) and the prepare step (scripts/prepareRecordings.ts).

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { wavStats, type ClipStats } from './wav.ts'

/** The layout fetch-recordings writes: recordings/<contributor>/<module>/<item>_<variant>.wav */
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const CLIP_FILE = /^[a-z0-9]+(-[a-z0-9]+)*_[a-z0-9]+(-[a-z0-9]+)*\.wav$/

/** Where one clip sits in the folder. */
export interface ClipRef {
  contributor: string
  module: string
  file: string
}

export interface Clip extends ClipRef, ClipStats {
  bytes: number
  /** When it was recorded, from the file's time (fetch-recordings sets it from S3). */
  recorded: string
}

/** The path parts of a clip, or null for anything that isn't one. */
export function clipRef(parts: string[]): ClipRef | null {
  const [contributor, module, file, ...rest] = parts
  if (rest.length || !SLUG.test(contributor ?? '') || !SLUG.test(module ?? '') || !CLIP_FILE.test(file ?? '')) return null
  return { contributor, module, file }
}

/** Where a clip lives on disk, under `dir`. */
export function clipPath(dir: string, { contributor, module, file }: ClipRef): string {
  return join(dir, contributor, module, file)
}

/** `contributor/module/file`: how a clip is named in the manifest and the decisions. */
export function clipKey({ contributor, module, file }: ClipRef): string {
  return `${contributor}/${module}/${file}`
}

/** Every clip under `dir`, in a stable order. Files that aren't clips are left out. */
export async function listClips(dir: string): Promise<ClipRef[]> {
  const clips: ClipRef[] = []
  for (const contributor of await listDir(dir)) {
    if (!SLUG.test(contributor)) continue
    for (const module of await listDir(join(dir, contributor))) {
      if (!SLUG.test(module)) continue
      for (const file of await listDir(join(dir, contributor, module))) {
        if (CLIP_FILE.test(file)) clips.push({ contributor, module, file })
      }
    }
  }
  return clips
}

/** Every clip under `dir`, measured. Ones that aren't readable WAVs are left out. */
export async function scanRecordings(dir: string): Promise<Clip[]> {
  const clips: Clip[] = []
  for (const ref of await listClips(dir)) {
    const path = clipPath(dir, ref)
    const [info, bytes] = await Promise.all([stat(path), readFile(path)])
    const stats = wavStats(bytes)
    if (!stats) continue
    clips.push({ ...ref, bytes: info.size, recorded: info.mtime.toISOString(), ...stats })
  }
  return clips
}

async function listDir(path: string): Promise<string[]> {
  return (await readdir(path, { withFileTypes: true }).catch(() => [])).map((e) => e.name).sort()
}
