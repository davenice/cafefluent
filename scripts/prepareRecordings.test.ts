// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareRecordings, readManifest } from './prepareRecordings.ts'
import { wavStats } from './wav.ts'
import { tone, wav } from './wavFixtures.ts'

describe('prepareRecordings', () => {
  let dir: string
  let outDir: string

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'prepare-'))
    dir = join(root, 'recordings')
    outDir = join(root, 'recordings-prepared')
  })
  afterEach(async () => {
    await rm(join(dir, '..'), { recursive: true, force: true })
  })

  const put = async (path: string, samples = tone({ level: 0.5, seconds: 1, before: 0.6, after: 0.4 })) => {
    await mkdir(join(dir, path, '..'), { recursive: true })
    await writeFile(join(dir, path), wav(samples))
  }
  const prepare = (force = false) => prepareRecordings({ dir, outDir, force })
  const exists = (path: string) => stat(path).then(() => true, () => false)

  it('writes a trimmed, levelled copy of every clip, and a manifest', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav')
    await put('sam-00ab12/bread/bap_name.wav', tone({ level: 0.05, seconds: 1 }))

    const result = await prepare()
    expect(result.prepared).toBe(2)
    expect(result.skipped).toBe(0)

    const copy = await readFile(join(outDir, 'amira-3f9a1c/allergens/milk_name.wav'))
    const stats = wavStats(copy)!
    // A second of words, with the silence either side cut back to the pad.
    expect(stats.durationMs).toBeLessThan(1500)
    expect(stats.leadMs).toBeLessThan(200)

    const manifest = (await readManifest(outDir))!
    expect(Object.keys(manifest.clips)).toEqual([
      'amira-3f9a1c/allergens/milk_name.wav',
      'sam-00ab12/bread/bap_name.wav',
    ])
    const entry = manifest.clips['amira-3f9a1c/allergens/milk_name.wav']
    expect(entry.cutLeadMs).toBeGreaterThan(400)
    expect(entry).toMatchObject(stats)
    // The quiet one was lifted, so the two play back at much the same level.
    const quiet = manifest.clips['sam-00ab12/bread/bap_name.wav']
    expect(quiet.gainDb).toBeGreaterThan(10)
    expect(Math.abs(quiet.rmsDb - entry.rmsDb)).toBeLessThan(2)
  })

  it('skips the clips it has already done', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav')
    await prepare()
    expect(await prepare()).toMatchObject({ prepared: 0, skipped: 1, redidAll: false })
  })

  it('does a clip again once it has been recorded again', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav')
    await prepare()
    // fetch-recordings sets the file's time from S3, so a new take moves it on.
    const path = join(dir, 'amira-3f9a1c/allergens/milk_name.wav')
    await writeFile(path, wav(tone({ level: 0.2, seconds: 1, before: 0.2 })))
    const later = new Date(Date.now() + 60_000)
    await utimes(path, later, later)

    expect(await prepare()).toMatchObject({ prepared: 1, skipped: 0 })
  })

  it('does a clip again when the prepared copy has been deleted', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav')
    await prepare()
    await rm(join(outDir, 'amira-3f9a1c/allergens/milk_name.wav'))
    expect(await prepare()).toMatchObject({ prepared: 1, skipped: 0 })
  })

  it('does everything again when the recipe has changed', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav')
    await prepare()
    const manifest = (await readManifest(outDir))!
    await writeFile(
      join(outDir, 'prepared.json'),
      JSON.stringify({ ...manifest, recipe: { ...manifest.recipe, padMs: 999 } }),
    )
    expect(await prepare()).toMatchObject({ prepared: 1, skipped: 0, recipeChanged: true, redidAll: true })
  })

  it('does everything again when told to', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav')
    await prepare()
    expect(await prepare(true)).toMatchObject({ prepared: 1, skipped: 0, redidAll: true, recipeChanged: false })
  })

  it('takes out the copy of a recording that is no longer there', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav')
    await put('amira-3f9a1c/allergens/egg_name.wav')
    await prepare()
    await rm(join(dir, 'amira-3f9a1c/allergens/egg_name.wav'))

    const result = await prepare()
    expect(result).toMatchObject({ removed: 1, skipped: 1 })
    expect(await exists(join(outDir, 'amira-3f9a1c/allergens/egg_name.wav'))).toBe(false)
    expect(await exists(join(outDir, 'amira-3f9a1c/allergens/milk_name.wav'))).toBe(true)
    expect(Object.keys((await readManifest(outDir))!.clips)).toEqual(['amira-3f9a1c/allergens/milk_name.wav'])
  })

  it('names the clips it cannot read and keeps going', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav')
    await mkdir(join(dir, 'amira-3f9a1c/bread'), { recursive: true })
    await writeFile(join(dir, 'amira-3f9a1c/bread/bap_name.wav'), 'not a wav')

    const result = await prepare()
    expect(result.failed).toEqual(['amira-3f9a1c/bread/bap_name.wav'])
    expect(result.prepared).toBe(1)
  })

  it('writes an empty manifest when there is nothing to prepare', async () => {
    const result = await prepare()
    expect(result.prepared).toBe(0)
    expect((await readManifest(outDir))!.clips).toEqual({})
  })
})
