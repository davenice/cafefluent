// Builds the offline review bundle: a folder someone outside the project can
// unzip and open in a browser, with no install and no dev server.
//
// `npm run bundle:review`. See README, "Sending the review to someone else".
//
// Three things make it work without a server:
//
// - The page is one HTML file with its script and styles inlined, because a
//   `file://` page is refused when it tries to load a module or fetch anything.
// - The clips, the phrases and the decisions so far are inlined with it, for the
//   same reason, and the audio sits beside the page as ordinary files, which an
//   `<audio>` element will play from file:// where fetch() would be blocked.
// - Decisions are kept in the reviewer's browser and come back as a downloaded
//   audio-review.json (src/review/backend.ts).
//
// Voices are named by the six characters the decisions file uses, never by a
// contributor's folder name: the bundle leaves the project, so no volunteer's
// name goes in it. That also means the file that comes back merges straight into
// audio-review.json.

import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { MODULES } from '../src/data/modules.ts'
import { buildScript, type Phrase, type ScriptModuleData } from '../src/recorder/script.ts'
import { voiceAlias, voiceAliases } from '../src/review/decisions.ts'
import type { BundleData } from '../src/review/bundle.ts'
import { clipKey, clipPath, scanRecordings } from './recordings.ts'
import { readManifest } from './prepareRecordings.ts'
import { readDecisions } from './reviewRecordings.ts'

const run = promisify(execFile)

export interface BundleFile {
  from: string
  /** Where it goes in the bundle, relative to review.html. */
  to: string
}

export interface BundlePlan {
  data: BundleData
  files: BundleFile[]
  /** Clips and generated files left out, with the reason, for the build to report. */
  skipped: string[]
}

export interface PlanPaths {
  dir: string
  preparedDir: string
  decisionsFile: string
  /** `public/`, where the generated clips the app plays today live. */
  publicDir: string
}

/**
 * What goes in the bundle: the data to inline and the audio to copy.
 *
 * Prepared clips only. An unprepared clip is left out rather than sent raw,
 * because the levels are what makes two voices comparable, and the originals
 * would roughly double the download for a case the reviewer can't act on anyway.
 */
export async function planBundle(
  { dir, preparedDir, decisionsFile, publicDir }: PlanPaths,
  phrases: Phrase[],
  made = new Date().toISOString(),
): Promise<BundlePlan> {
  const [recorded, manifest, decisions] = await Promise.all([
    scanRecordings(dir),
    readManifest(preparedDir),
    readDecisions(decisionsFile),
  ])
  // Throws on two voices sharing their six characters, as writing the file does.
  const { collapse } = voiceAliases([...new Set(recorded.map((c) => c.contributor))])
  const alias = (contributor: string) => collapse[contributor] ?? voiceAlias(contributor)

  const files: BundleFile[] = []
  const skipped: string[] = []
  const clips: BundleData['clips'] = []

  for (const clip of recorded) {
    const prepared = manifest?.clips[clipKey(clip)]
    if (!prepared) {
      skipped.push(`${clipKey(clip)}: not prepared yet`)
      continue
    }
    const path = `${alias(clip.contributor)}/${clip.module}/${clip.file}`
    clips.push({ ...clip, contributor: alias(clip.contributor), prepared })
    files.push({ from: clipPath(preparedDir, clip), to: join('prepared', path) })
  }

  // The generated clip is one of the options, so the bundle carries the ones the
  // phrases name. Nothing else in public/ is any use offline.
  for (const generated of new Set(phrases.map((p) => `content/${p.module}/audio/${p.file.replace(/\.wav$/, '.mp3')}`))) {
    files.push({ from: join(publicDir, generated), to: generated })
  }

  return {
    data: {
      made,
      phrases,
      clips: clips.sort((a, b) => clipKey(a).localeCompare(clipKey(b))),
      prepared: manifest ? { at: manifest.prepared } : null,
      decisions,
    },
    files,
    skipped,
  }
}

/** The phrase list, read off disk rather than fetched as the app does. */
export async function phrasesFromDisk(publicDir: string): Promise<Phrase[]> {
  const withAudio = MODULES.filter((m) => m.audioBase)
  return buildScript(
    await Promise.all(
      withAudio.map(async (m) => ({
        id: m.id,
        title: m.title,
        // dataUrl is a URL the app fetches ('/content/x/data.json'); here it's a path under public/.
        data: JSON.parse(await readFile(join(publicDir, m.dataUrl), 'utf8')) as ScriptModuleData,
      })),
    ),
  )
}

/**
 * review.html built to a single self-contained file, with `data` inlined.
 *
 * Built on its own, not as part of the app: no service worker, and nothing
 * split out, since one `file://` page can't load a second script. The bundle is
 * a classic script rather than a module for the same reason — browsers differ
 * on inline modules from file://, and there is nothing to gain from one here.
 */
export async function buildReviewHtml(root: string, data: BundleData): Promise<string> {
  const outDir = join(root, 'node_modules', '.cache', 'review-bundle')
  await rm(outDir, { recursive: true, force: true })
  await build({
    configFile: false,
    root,
    // Everything is inlined, so the page never asks for a file by URL.
    base: './',
    plugins: [react()],
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: true,
      // Well past the biggest asset, so fonts and images land in the HTML too.
      assetsInlineLimit: 100 * 1024 * 1024,
      rolldownOptions: {
        input: { review: join(root, 'review.html') },
        output: { format: 'iife' },
      },
    },
  })

  const inlined = await inlineAssets(await readFile(join(outDir, 'review.html'), 'utf8'), outDir)
  return insert(inlined, '</head>', `  <script>window.__REVIEW__ = ${jsonForScript(data)}</script>\n  </head>`)
}

/**
 * The built page's script and stylesheet put inline, so one file is the whole page.
 *
 * The script moves to the end of the body on the way. Vite links it from the head
 * as a module, which browsers defer; inline it there as a plain script and it
 * runs straight away, before the element it renders into exists.
 */
export async function inlineAssets(html: string, outDir: string): Promise<string> {
  const read = (src: string) => readFile(join(outDir, src.replace(/^[./]+/, '')), 'utf8')
  const tags = (pattern: RegExp) => [...html.matchAll(pattern)].map((m) => [m[0], m[1]] as const)

  let out = html
  const scripts: string[] = []
  for (const [tag, src] of tags(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)) {
    scripts.push(await read(src))
    out = insert(out, tag, '')
  }
  // Stylesheets stay where they were, so the page doesn't flash unstyled.
  for (const [tag, href] of tags(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)) {
    out = insert(out, tag, `<style>${await read(href)}</style>`)
  }
  return insert(out, '</body>', `${scripts.map((js) => `<script>${js}</script>`).join('\n')}\n  </body>`)
}

/**
 * Put `replacement` where `find` is, taking it literally.
 *
 * String.replace reads `$&`, `$1` and friends in the replacement as references
 * to the match, and minified React is full of them, so passing the bundle
 * straight to replace() quietly rewrites parts of it. A function replacement is
 * never scanned for those patterns.
 */
export function insert(html: string, find: string, replacement: string): string {
  return html.replace(find, () => replacement)
}

/**
 * JSON safe to drop inside a <script> element. `</script>` anywhere in the data
 * would end the element early, and U+2028/9 are newlines to a JS parser.
 */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export interface BundleResult {
  dir: string
  zip: string | null
  clips: number
  phrases: number
  skipped: string[]
  bytes: number
}

/** Write the bundle to `outDir` and zip it beside itself. */
export async function bundleReview({
  root,
  outDir,
  paths,
}: {
  root: string
  outDir: string
  paths: PlanPaths
}): Promise<BundleResult> {
  const phrases = await phrasesFromDisk(paths.publicDir)
  const plan = await planBundle(paths, phrases)
  if (plan.data.clips.length === 0) {
    throw new Error(
      'No prepared clips to review. Run npm run fetch:recordings and npm run prepare:recordings first.',
    )
  }

  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'review.html'), await buildReviewHtml(root, plan.data))
  await writeFile(join(outDir, 'READ ME FIRST.txt'), readmeForReviewer(plan))

  for (const file of plan.files) {
    const to = join(outDir, file.to)
    await mkdir(dirname(to), { recursive: true })
    await cp(file.from, to).catch(() => plan.skipped.push(`${file.to}: missing from ${relative(root, file.from)}`))
  }

  const zip = await zipUp(outDir)
  return {
    dir: outDir,
    zip,
    clips: plan.data.clips.length,
    phrases: phrases.length,
    skipped: plan.skipped,
    bytes: zip ? (await stat(zip)).size : 0,
  }
}

/**
 * Zip the folder, or answer null if this machine has no `zip`. A missing zip is
 * not worth failing over: the folder is built and can be compressed by hand.
 */
async function zipUp(dir: string): Promise<string | null> {
  const zip = `${dir}.zip`
  await rm(zip, { force: true })
  try {
    // -r into the parent, naming the folder, so the zip holds one folder rather
    // than loose files all over the reviewer's Downloads.
    await run('zip', ['-rq', '-9', zip, dir.split('/').pop()!], { cwd: dirname(dir) })
    return zip
  } catch {
    return null
  }
}

/** What the reviewer sees in the folder before they open anything. */
export function readmeForReviewer(plan: BundlePlan): string {
  return `CafeFluent — audio review
=========================

Thank you for helping. There is nothing to install.

1. Unzip this folder somewhere, if you haven't already. Keep all the files
   together: the page plays the audio from the folders beside it.
2. Open "review.html" — double-click it, or drag it onto a browser window.
   Chrome, Edge, Firefox and Safari all work.
3. For each phrase you will hear the computer-generated voice the app uses
   today, and a recording from each volunteer. Press "Play all" to hear them
   one after another, then "Pick" the best one. Mark anything unusable "Bad" —
   a misread word, a cough, background noise.
4. You don't have to finish in one go. Your choices are remembered in this
   browser, on this computer, as long as you open the same copy of the page.
5. When you are done, press "Download decisions" at the top. That saves a file
   called audio-review.json. Send that file back — it is the only thing that
   needs to come back.

${plan.data.clips.length} recordings of ${plan.data.phrases.length} phrases.
Made ${plan.data.made}.
`
}

// ------------------------------------------------------------------- the script

/** `npm run bundle:review`, through scripts/bundleReview.run.mjs. */
export async function main(root: string): Promise<void> {
  const result = await bundleReview({
    root,
    outDir: join(root, 'review-bundle'),
    paths: {
      dir: join(root, 'recordings'),
      preparedDir: join(root, 'recordings-prepared'),
      decisionsFile: join(root, 'audio-review.json'),
      publicDir: join(root, 'public'),
    },
  })

  console.log(`${result.clips} clips of ${result.phrases} phrases in ${relative(root, result.dir)}/`)
  if (result.skipped.length) {
    console.log(`\nLeft out (${result.skipped.length}):`)
    for (const note of result.skipped.slice(0, 10)) console.log(`  ${note}`)
    if (result.skipped.length > 10) console.log(`  … and ${result.skipped.length - 10} more`)
  }
  console.log(
    result.zip
      ? `\nSend ${relative(root, result.zip)} (${(result.bytes / 1024 / 1024).toFixed(1)} MB).`
      : `\nNo zip made: this machine has no "zip". Compress ${relative(root, result.dir)}/ by hand.`,
  )
}
