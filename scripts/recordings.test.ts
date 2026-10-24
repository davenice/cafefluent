// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clipRef, listClips, scanRecordings } from './recordings.ts'
import { tone, wav } from './wavFixtures.ts'

describe('clipRef', () => {
  it('takes the layout fetch-recordings writes', () => {
    expect(clipRef(['amira-3f9a1c', 'allergens', 'milk_name.wav'])).toEqual({
      contributor: 'amira-3f9a1c',
      module: 'allergens',
      file: 'milk_name.wav',
    })
  })

  it('refuses anything else, so a path can never leave the folder', () => {
    expect(clipRef(['..', 'allergens', 'milk_name.wav'])).toBeNull()
    expect(clipRef(['amira-3f9a1c', '..', 'milk_name.wav'])).toBeNull()
    expect(clipRef(['amira-3f9a1c', 'allergens', '../../etc/passwd'])).toBeNull()
    expect(clipRef(['amira-3f9a1c', 'allergens', 'milk_name.wav', 'extra'])).toBeNull()
    expect(clipRef(['amira-3f9a1c', 'allergens', 'notes.txt'])).toBeNull()
    expect(clipRef(['amira-3f9a1c', 'allergens'])).toBeNull()
  })
})

describe('scanRecordings', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'review-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const put = async (path: string, bytes: Uint8Array | string) => {
    await mkdir(join(dir, path, '..'), { recursive: true })
    await writeFile(join(dir, path), bytes)
  }

  it('lists every clip with its contributor, module and measurements', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav', wav(tone({ level: 0.5, seconds: 1 })))
    await put('sam-00ab12/bread/bap_name.wav', wav(tone({ level: 0.25, seconds: 1 })))

    const clips = await scanRecordings(dir)
    expect(clips.map((c) => [c.contributor, c.module, c.file])).toEqual([
      ['amira-3f9a1c', 'allergens', 'milk_name.wav'],
      ['sam-00ab12', 'bread', 'bap_name.wav'],
    ])
    expect(clips[0].durationMs).toBe(1000)
    expect(clips[0].peakDb).toBeGreaterThan(clips[1].peakDb)
    expect(clips[0].bytes).toBeGreaterThan(0)
    expect(clips[0].recorded).toMatch(/^\d{4}-/)
  })

  it('leaves out files that are not clips, and unreadable ones', async () => {
    await put('amira-3f9a1c/allergens/milk_name.wav', wav(tone({ seconds: 1 })))
    await put('amira-3f9a1c/allergens/notes.txt', 'ignore me')
    await put('amira-3f9a1c/allergens/Milk Name.wav', wav(tone({ seconds: 1 })))
    await put('amira-3f9a1c/allergens/broken_clip.wav', 'not a wav at all')
    await put('.DS_Store/allergens/milk_name.wav', wav(tone({ seconds: 1 })))

    expect((await scanRecordings(dir)).map((c) => c.file)).toEqual(['milk_name.wav'])
    // listClips doesn't read the files, so the broken one is still a clip to it.
    expect((await listClips(dir)).map((c) => c.file)).toEqual(['broken_clip.wav', 'milk_name.wav'])
  })

  it('gives nothing when there are no recordings yet', async () => {
    expect(await scanRecordings(join(dir, 'nowhere'))).toEqual([])
  })
})
