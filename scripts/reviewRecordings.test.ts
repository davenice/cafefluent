// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import { loadDecisions, readDecisions, reviewMiddleware, reviewState } from './reviewRecordings.ts'
import { prepareRecordings } from './prepareRecordings.ts'
import { tone, wav } from './wavFixtures.ts'

/** One request through the middleware, waiting for whatever it answers. */
async function call(
  middleware: Connect.NextHandleFunction,
  { url, method = 'GET', body }: { url: string; method?: string; body?: unknown },
) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = Object.assign(Readable.from(chunks), { url, method }) as unknown as IncomingMessage
  const answer: { statusCode: number; body?: Buffer | string; next: boolean } = { statusCode: 200, next: false }
  await new Promise<void>((resolve) => {
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (chunk?: Buffer | string) => {
        answer.statusCode = res.statusCode
        answer.body = chunk
        resolve()
      },
    }
    middleware(req, res as unknown as ServerResponse, () => {
      answer.next = true
      resolve()
    })
  })
  return {
    ...answer,
    json: () => JSON.parse(String(answer.body)) as Record<string, never>,
  }
}

describe('the review dev server', () => {
  let root: string
  let paths: { dir: string; preparedDir: string; decisionsFile: string; exportFile: string }
  let middleware: Connect.NextHandleFunction

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'review-api-'))
    paths = {
      dir: join(root, 'recordings'),
      preparedDir: join(root, 'recordings-prepared'),
      decisionsFile: join(root, 'audio-review.json'),
      exportFile: join(root, 'recordings-prepared', 'picks.json'),
    }
    middleware = reviewMiddleware(paths)
    await mkdir(join(paths.dir, 'amira-3f9a1c/allergens'), { recursive: true })
    await writeFile(
      join(paths.dir, 'amira-3f9a1c/allergens/milk_name.wav'),
      wav(tone({ level: 0.5, seconds: 1, before: 0.6 })),
    )
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const pick = { type: 'pick', phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' }

  it('lists the clips, with nothing prepared and nothing decided yet', async () => {
    const res = await call(middleware, { url: '/recordings-api/review.json' })
    const state = res.json() as unknown as Awaited<ReturnType<typeof reviewState>>
    expect(state.clips.map((c) => c.file)).toEqual(['milk_name.wav'])
    expect(state.clips[0].prepared).toBeUndefined()
    expect(state.prepared).toBeNull()
    expect(state.decisions).toEqual({ version: 1, hiddenVoices: [], phrases: {} })
  })

  it('adds what the prepare step did to each clip', async () => {
    await prepareRecordings({ dir: paths.dir, outDir: paths.preparedDir })
    const state = (await call(middleware, { url: '/recordings-api/review.json' })).json() as unknown as Awaited<
      ReturnType<typeof reviewState>
    >
    expect(state.clips[0].prepared?.cutLeadMs).toBeGreaterThan(400)
    expect(state.prepared?.at).toMatch(/^\d{4}-/)
  })

  it('saves a decision to the file, and gives it back on the next load', async () => {
    const saved = await call(middleware, { url: '/recordings-api/decisions', method: 'POST', body: pick })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().decisions).toMatchObject({
      phrases: { 'allergens/milk_name.wav': { pick: 'amira-3f9a1c' } },
    })

    const state = (await call(middleware, { url: '/recordings-api/review.json' })).json()
    expect(state.decisions).toMatchObject({ phrases: { 'allergens/milk_name.wav': { pick: 'amira-3f9a1c' } } })
  })

  it('writes the voice without its name, since the file is committed', async () => {
    await call(middleware, { url: '/recordings-api/decisions', method: 'POST', body: pick })
    await call(middleware, {
      url: '/recordings-api/decisions',
      method: 'POST',
      body: { type: 'hide', contributor: 'amira-3f9a1c', hidden: true },
    })

    const text = await readFile(paths.decisionsFile, 'utf8')
    expect(text).not.toContain('amira')
    const file = JSON.parse(text)
    expect(file.phrases['allergens/milk_name.wav'].pick).toBe('3f9a1c')
    expect(file.hiddenVoices).toEqual(['3f9a1c'])
  })

  it('puts a name back in the decisions file without one', async () => {
    await writeFile(
      paths.decisionsFile,
      JSON.stringify({ version: 1, hiddenVoices: ['3f9a1c'], phrases: { 'allergens/milk_name.wav': { pick: '3f9a1c' } } }),
    )
    const state = (await call(middleware, { url: '/recordings-api/review.json' })).json() as unknown as Awaited<
      ReturnType<typeof reviewState>
    >
    expect(state.decisions.hiddenVoices).toEqual(['amira-3f9a1c'])
    expect(state.decisions.phrases['allergens/milk_name.wav'].pick).toBe('amira-3f9a1c')
  })

  it('takes the names out of a file that still has them, next time the page loads', async () => {
    await writeFile(
      paths.decisionsFile,
      JSON.stringify({ version: 1, hiddenVoices: [], phrases: { 'allergens/milk_name.wav': { pick: 'amira-3f9a1c' } } }),
    )
    await call(middleware, { url: '/recordings-api/review.json' })
    expect(await readFile(paths.decisionsFile, 'utf8')).not.toContain('amira')
    // And the decision itself is still there.
    expect(await loadDecisions(paths)).toMatchObject({
      phrases: { 'allergens/milk_name.wav': { pick: 'amira-3f9a1c' } },
    })
  })

  it('keeps a decision about a voice whose recordings are not here', async () => {
    await writeFile(
      paths.decisionsFile,
      JSON.stringify({ version: 1, hiddenVoices: [], phrases: { 'bread/bap_name.wav': { bad: ['9c0de1'] } } }),
    )
    await call(middleware, { url: '/recordings-api/review.json' })
    const file = JSON.parse(await readFile(paths.decisionsFile, 'utf8'))
    expect(file.phrases['bread/bap_name.wav'].bad).toEqual(['9c0de1'])
  })

  it('applies each change to what is on disk, so an edit by hand is kept', async () => {
    await call(middleware, { url: '/recordings-api/decisions', method: 'POST', body: pick })
    // Someone else — or the same reviewer in another tab — hides a voice.
    const file = JSON.parse(await readFile(paths.decisionsFile, 'utf8'))
    await writeFile(paths.decisionsFile, JSON.stringify({ ...file, hiddenVoices: ['00ab12'] }))

    const res = await call(middleware, {
      url: '/recordings-api/decisions',
      method: 'POST',
      body: { type: 'bad', phrase: 'bread/bap_name.wav', source: 'sam-00ab12', bad: true },
    })
    const decisions = res.json().decisions as unknown as { hiddenVoices: string[]; phrases: Record<string, unknown> }
    expect(Object.keys(decisions.phrases)).toEqual(['allergens/milk_name.wav', 'bread/bap_name.wav'])
    // sam has no folder in recordings/, so there is no name to put back.
    expect(decisions.hiddenVoices).toEqual(['00ab12'])
  })

  it('refuses a change it does not understand', async () => {
    const res = await call(middleware, { url: '/recordings-api/decisions', method: 'POST', body: { type: 'rm -rf' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/change/)
  })

  it('writes the picked set where the import step will look for it', async () => {
    const res = await call(middleware, {
      url: '/recordings-api/export',
      method: 'POST',
      body: { picked: [{ phrase: 'allergens/milk_name.wav', source: 'amira-3f9a1c' }], undecided: ['bread/bap_name.wav'] },
    })
    expect(res.json()).toMatchObject({ picked: 1, file: paths.exportFile })
    const written = JSON.parse(await readFile(paths.exportFile, 'utf8'))
    expect(written.picked).toHaveLength(1)
    expect(written.undecided).toEqual(['bread/bap_name.wav'])
    expect(written.exported).toMatch(/^\d{4}-/)
  })

  it('refuses an export that is not a set of picks', async () => {
    const res = await call(middleware, { url: '/recordings-api/export', method: 'POST', body: { picked: 'all of them' } })
    expect(res.statusCode).toBe(400)
  })

  it('plays a clip as recorded, and its prepared copy', async () => {
    await prepareRecordings({ dir: paths.dir, outDir: paths.preparedDir })
    const original = await call(middleware, { url: '/recordings/amira-3f9a1c/allergens/milk_name.wav' })
    const prepared = await call(middleware, { url: '/prepared/amira-3f9a1c/allergens/milk_name.wav' })
    expect(original.body?.length).toBeGreaterThan(44)
    expect(prepared.body?.length).toBeGreaterThan(44)
    // The prepared one has had its half second of silence taken off.
    expect(prepared.body!.length).toBeLessThan(original.body!.length)
  })

  it('serves nothing but a clip', async () => {
    expect((await call(middleware, { url: '/recordings/../../etc/passwd' })).statusCode).toBe(404)
    expect((await call(middleware, { url: '/prepared/amira-3f9a1c/allergens/notes.txt' })).statusCode).toBe(404)
    expect((await call(middleware, { url: '/recordings/amira-3f9a1c/allergens/nothing_here.wav' })).statusCode).toBe(404)
    // Not prepared yet: the file isn't there even though the name is a clip's.
    expect((await call(middleware, { url: '/prepared/amira-3f9a1c/allergens/milk_name.wav' })).statusCode).toBe(404)
  })

  it('leaves every other request to the dev server', async () => {
    expect((await call(middleware, { url: '/review.html' })).next).toBe(true)
    expect((await call(middleware, { url: '/recordings-api/review.json', method: 'POST' })).next).toBe(true)
  })
})

describe('readDecisions', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'decisions-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads nothing decided when the file is not there yet', async () => {
    expect(await readDecisions(join(root, 'audio-review.json'))).toEqual({ version: 1, hiddenVoices: [], phrases: {} })
  })

  it('refuses to go on with a file it cannot read, rather than overwrite it', async () => {
    const file = join(root, 'audio-review.json')
    await writeFile(file, '{ half a file')
    await expect(readDecisions(file)).rejects.toThrow(/not valid JSON/)
  })
})
