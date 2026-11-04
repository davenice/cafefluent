// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inlineAssets, insert, jsonForScript, planBundle, readmeForReviewer } from './bundleReview.ts'
import { prepareRecordings } from './prepareRecordings.ts'
import { tone, wav } from './wavFixtures.ts'
import type { Phrase } from '../src/recorder/script.ts'

const phrase = (over: Partial<Phrase> = {}): Phrase => ({
  module: 'allergens',
  moduleTitle: 'Allergens',
  id: 'milk',
  variant: 'name',
  text: 'Milk',
  file: 'milk_name.wav',
  ...over,
})

describe('planBundle', () => {
  let root: string
  let paths: Parameters<typeof planBundle>[0]

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'bundle-'))
    paths = {
      dir: join(root, 'recordings'),
      preparedDir: join(root, 'prepared'),
      decisionsFile: join(root, 'audio-review.json'),
      publicDir: join(root, 'public'),
    }
  })
  afterEach(async () => rm(root, { recursive: true, force: true }))

  /** A clip on disk, as fetch:recordings would leave it. */
  const record = async (contributor: string, module: string, file: string) => {
    await mkdir(join(paths.dir, contributor, module), { recursive: true })
    await writeFile(join(paths.dir, contributor, module, file), wav(tone({ seconds: 0.9 })))
  }

  it('names voices by their six characters, never by the contributor folder', async () => {
    await record('amira-k-3f9a1c', 'allergens', 'milk_name.wav')
    await prepareRecordings({ dir: paths.dir, outDir: paths.preparedDir })

    const plan = await planBundle(paths, [phrase()])

    expect(plan.data.clips).toHaveLength(1)
    expect(plan.data.clips[0].contributor).toBe('3f9a1c')
    // And the copy goes to a path with no name in it either, since the page
    // builds its urls from the contributor it was given.
    expect(plan.files.map((f) => f.to)).toContain(join('prepared', '3f9a1c', 'allergens', 'milk_name.wav'))
    // Nothing that ships carries the name: not the inlined data, not the paths
    // it is copied to. `from` is a path on this machine and stays here.
    expect(JSON.stringify(plan.data)).not.toContain('amira')
    expect(plan.files.every((f) => !f.to.includes('amira'))).toBe(true)
  })

  it('takes the clip from the prepared folder, not the recording', async () => {
    await record('sam-00ab12', 'allergens', 'milk_name.wav')
    await prepareRecordings({ dir: paths.dir, outDir: paths.preparedDir })

    const plan = await planBundle(paths, [phrase()])
    const clip = plan.files.find((f) => f.to.startsWith('prepared'))!

    expect(clip.from.startsWith(paths.preparedDir)).toBe(true)
    expect(plan.data.clips[0].prepared).toBeDefined()
  })

  it('leaves out a clip that has not been prepared, and says so', async () => {
    await record('sam-00ab12', 'allergens', 'milk_name.wav')
    await prepareRecordings({ dir: paths.dir, outDir: paths.preparedDir })
    // Recorded after the prepare step ran: there is no levelled copy to send.
    await record('sam-00ab12', 'allergens', 'egg_name.wav')

    const plan = await planBundle(paths, [phrase(), phrase({ id: 'egg', file: 'egg_name.wav' })])

    expect(plan.data.clips.map((c) => c.file)).toEqual(['milk_name.wav'])
    expect(plan.skipped).toEqual(['sam-00ab12/allergens/egg_name.wav: not prepared yet'])
  })

  it('carries the generated clip for each phrase, once', async () => {
    await record('sam-00ab12', 'allergens', 'milk_name.wav')
    await prepareRecordings({ dir: paths.dir, outDir: paths.preparedDir })

    const plan = await planBundle(paths, [phrase(), phrase({ variant: 'allergic', file: 'milk_allergic.wav' })])

    expect(plan.files.filter((f) => f.to.startsWith('content')).map((f) => f.to)).toEqual([
      'content/allergens/audio/milk_name.mp3',
      'content/allergens/audio/milk_allergic.mp3',
    ])
  })

  it('sends the decisions so far, so a second round starts where the first left off', async () => {
    await record('sam-00ab12', 'allergens', 'milk_name.wav')
    await prepareRecordings({ dir: paths.dir, outDir: paths.preparedDir })
    await writeFile(
      paths.decisionsFile,
      JSON.stringify({ version: 1, hiddenVoices: ['beef12'], phrases: { 'allergens/milk_name.wav': { pick: '00ab12' } } }),
    )

    const plan = await planBundle(paths, [phrase()])

    expect(plan.data.decisions).toEqual({
      version: 1,
      hiddenVoices: ['beef12'],
      phrases: { 'allergens/milk_name.wav': { pick: '00ab12' } },
    })
  })

  it('refuses two voices that would share their six characters', async () => {
    await record('amira-3f9a1c', 'allergens', 'milk_name.wav')
    await record('sam-3f9a1c', 'allergens', 'milk_name.wav')
    await prepareRecordings({ dir: paths.dir, outDir: paths.preparedDir })

    await expect(planBundle(paths, [phrase()])).rejects.toThrow(/would both be "3f9a1c"/)
  })
})

describe('inlineAssets', () => {
  let outDir: string
  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'inline-'))
    await mkdir(join(outDir, 'assets'), { recursive: true })
  })
  afterEach(async () => rm(outDir, { recursive: true, force: true }))

  const page = (head: string, body = '<div id="review-root"></div>') =>
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

  it('inlines the script at the end of the body, so the page exists when it runs', async () => {
    await writeFile(join(outDir, 'assets', 'review.js'), 'console.log("app")')

    const html = await inlineAssets(page('<script type="module" src="./assets/review.js"></script>'), outDir)

    expect(html).not.toContain('src=')
    expect(html).toContain('<script>console.log("app")</script>')
    // After the root element, not before it.
    expect(html.indexOf('console.log("app")')).toBeGreaterThan(html.indexOf('review-root'))
  })

  it('inlines the stylesheet where it was', async () => {
    await writeFile(join(outDir, 'assets', 'review.css'), 'body{color:red}')

    const html = await inlineAssets(page('<link rel="stylesheet" href="./assets/review.css">'), outDir)

    expect(html).toContain('<style>body{color:red}</style>')
    expect(html.indexOf('body{color:red}')).toBeLessThan(html.indexOf('<body>'))
  })

  it('keeps a bundle holding $& intact', async () => {
    // Minified React is full of these. Passed to String.replace as a
    // replacement they would be read as references to the match instead.
    await writeFile(join(outDir, 'assets', 'review.js'), 'x.replace(re,"$&/")+"$`"+"$1"')

    const html = await inlineAssets(page('<script type="module" src="./assets/review.js"></script>'), outDir)

    expect(html).toContain('x.replace(re,"$&/")+"$`"+"$1"')
  })
})

describe('insert', () => {
  it('takes the replacement literally', () => {
    expect(insert('a<!--here-->b', '<!--here-->', '$&$1$`')).toBe('a$&$1$`b')
  })
})

describe('jsonForScript', () => {
  it('escapes a closing tag that would end the script element', () => {
    const json = jsonForScript({ text: '</script><script>alert(1)</script>' })

    expect(json).not.toContain('</script>')
    expect(JSON.parse(json)).toEqual({ text: '</script><script>alert(1)</script>' })
  })

  it('escapes the separators a JS parser reads as newlines', () => {
    const json = jsonForScript({ text: 'a b c' })

    expect(json).not.toContain(' ')
    expect(json).not.toContain(' ')
    expect(JSON.parse(json)).toEqual({ text: 'a b c' })
  })
})

describe('readmeForReviewer', () => {
  it('tells the reviewer the one thing that has to come back', async () => {
    const text = readmeForReviewer({
      data: { made: '2026-11-03T00:00:00.000Z', phrases: [phrase()], clips: [], prepared: null, decisions: {} },
      files: [],
      skipped: [],
    })

    expect(text).toContain('audio-review.json')
    expect(text).toContain('review.html')
  })
})
