// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { fetchRecordings } from './fetch-recordings.mjs'

/** An in-memory bucket. Small pages, so paging gets tested. */
class FakeS3 {
  objects = new Map()
  gets = []
  pageSize = 2

  put(Key, text, LastModified = new Date('2026-10-01T09:00:00Z')) {
    this.objects.set(Key, { body: Buffer.from(text), LastModified })
  }

  async send(command) {
    const { Key, Prefix, ContinuationToken } = command.input
    if (command instanceof GetObjectCommand) {
      this.gets.push(Key)
      const { body } = this.objects.get(Key)
      return { Body: { transformToByteArray: async () => new Uint8Array(body) } }
    }
    if (command instanceof ListObjectsV2Command) {
      const keys = [...this.objects.keys()].filter((k) => k.startsWith(Prefix)).sort()
      const start = Number(ContinuationToken ?? 0)
      const end = start + this.pageSize
      return {
        Contents: keys.slice(start, end).map((k) => ({
          Key: k, Size: this.objects.get(k).body.length, LastModified: this.objects.get(k).LastModified,
        })),
        IsTruncated: end < keys.length,
        NextContinuationToken: end < keys.length ? String(end) : undefined,
      }
    }
    throw new Error('unexpected command')
  }
}

let s3
let dir
const run = (log) => fetchRecordings({ s3, bucket: 'cafefluent-recordings', dir, log })

beforeEach(async () => {
  s3 = new FakeS3()
  dir = await mkdtemp(join(tmpdir(), 'recordings-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('fetchRecordings', () => {
  it('copies every clip into <id>/<module>/<file>, across pages, and sets its time', async () => {
    s3.put('clips/amira-3f9a1c/allergens/milk_name.wav', 'milk')
    s3.put('clips/amira-3f9a1c/allergens/eggs_allergic.wav', 'eggs')
    s3.put('clips/sam-00ab12/coffee/handle_name.wav', 'handle', new Date('2026-10-02T10:00:00Z'))
    s3.put('consent/amira-3f9a1c.json', '{}')
    s3.put('contributors.json', '[]')

    const summary = await run()

    expect(summary).toEqual({
      'amira-3f9a1c': { clips: 2, downloaded: 2 },
      'sam-00ab12': { clips: 1, downloaded: 1 },
    })
    expect(await readFile(join(dir, 'amira-3f9a1c/allergens/milk_name.wav'), 'utf8')).toBe('milk')
    expect(await readFile(join(dir, 'sam-00ab12/coffee/handle_name.wav'), 'utf8')).toBe('handle')
    expect((await stat(join(dir, 'sam-00ab12/coffee/handle_name.wav'))).mtime).toEqual(new Date('2026-10-02T10:00:00Z'))
  })

  it('skips clips already up to date, and fetches ones recorded again', async () => {
    s3.put('clips/amira-3f9a1c/allergens/milk_name.wav', 'milk')
    s3.put('clips/amira-3f9a1c/allergens/eggs_name.wav', 'eggs')
    await run()
    s3.gets = []

    s3.put('clips/amira-3f9a1c/allergens/eggs_name.wav', 'eggs, take 2', new Date('2026-10-03T09:00:00Z'))
    const summary = await run()

    expect(s3.gets).toEqual(['clips/amira-3f9a1c/allergens/eggs_name.wav'])
    expect(summary['amira-3f9a1c']).toEqual({ clips: 2, downloaded: 1 })
    expect(await readFile(join(dir, 'amira-3f9a1c/allergens/eggs_name.wav'), 'utf8')).toBe('eggs, take 2')
  })

  it('replaces a local file that differs, even if it is newer', async () => {
    s3.put('clips/amira-3f9a1c/allergens/milk_name.wav', 'milk')
    await mkdir(join(dir, 'amira-3f9a1c/allergens'), { recursive: true })
    await writeFile(join(dir, 'amira-3f9a1c/allergens/milk_name.wav'), 'truncated')
    await run()
    expect(await readFile(join(dir, 'amira-3f9a1c/allergens/milk_name.wav'), 'utf8')).toBe('milk')
  })

  it.each([
    'clips/../../etc/milk_name.wav',
    'clips/amira-3f9a1c/allergens/extra/milk_name.wav',
    'clips/Amira/allergens/milk_name.wav',
    'clips/amira-3f9a1c/allergens/milk_name.mp3',
  ])('skips the unexpected key %s', async (key) => {
    s3.put(key, 'x')
    const log = vi.fn()
    expect(await run(log)).toEqual({})
    expect(log).toHaveBeenCalledWith(`Skipping unexpected key ${key}`)
    expect(s3.gets).toEqual([])
  })

  it('returns nothing for an empty bucket', async () => {
    expect(await run()).toEqual({})
  })
})
