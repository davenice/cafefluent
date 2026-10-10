// @vitest-environment node
// Checks that every file the app will ask for exists in public/content: data
// files, images and audio. Runs with `npm test`, or alone with `npm run check:content`.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { MODULES } from '../src/data/modules'
import { SENTENCE_VARIANTS } from '../src/data/sentenceVariants'
import type { ModuleData, ModuleDef } from '../src/types'

const PUBLIC = join(import.meta.dirname, '..', 'public')

// The audio folder the quiz uses when a module doesn't set one (see QuizShell).
const DEFAULT_AUDIO_BASE = '/content/allergens/audio/'

function loadData(mod: ModuleDef): ModuleData {
  return JSON.parse(readFileSync(join(PUBLIC, mod.dataUrl), 'utf8'))
}

/** Every public path the module can request, each with what needs it. */
function expectedFiles(mod: ModuleDef, data: ModuleData): Map<string, string> {
  const files = new Map<string, string>()
  const add = (path: string, reason: string) => { if (!files.has(path)) files.set(path, reason) }
  const audioBase = mod.audioBase ?? DEFAULT_AUDIO_BASE

  for (const item of data.items) add(`${mod.imageBase}${item.image}`, `image for item "${item.id}"`)
  if (mod.imageLegend) add(`${mod.imageBase}${mod.imageLegend}`, 'image legend')

  for (const task of mod.tasks) {
    const why = (detail: string) => `${task.id} (${task.type}): ${detail}`
    switch (task.type) {
      case 'audio-match':
        // Each question picks any of the task's variants, for any item.
        for (const item of data.items) {
          for (const variant of task.audioVariants ?? ['name']) {
            add(`${audioBase}${item.id}_${variant}.mp3`, why(`"${variant}" audio for "${item.id}"`))
          }
        }
        break
      case 'sentence-match':
        // Each item is only asked with the sentences it has, or all of them if none are listed.
        for (const item of data.items) {
          const own = item.variants ? SENTENCE_VARIANTS.filter(v => item.variants!.includes(v)) : []
          for (const variant of own.length ? own : SENTENCE_VARIANTS) {
            add(`${audioBase}${item.id}_${variant}.mp3`, why(`"${variant}" audio for "${item.id}"`))
          }
        }
        break
      case 'product-match':
        for (const product of data.products ?? []) {
          add(`${mod.imageBase}${product.image}`, why(`image for product "${product.id}"`))
        }
        break
      case 'diagram-label':
      case 'diagram-audio':
        for (const diagram of data.diagrams ?? []) {
          add(`${mod.imageBase}${diagram.image}`, why(`image for diagram "${diagram.id}"`))
          if (task.type === 'diagram-audio') {
            for (const hotspot of diagram.hotspots) {
              add(`${mod.audioBase ?? ''}${hotspot.id}_name.mp3`, why(`audio for hotspot "${hotspot.id}"`))
            }
          }
        }
        break
    }
  }
  return files
}

describe.each(MODULES.map(mod => [mod.id, mod] as const))('content for %s', (_, mod) => {
  it('has a data file that parses', () => {
    expect(existsSync(join(PUBLIC, mod.dataUrl)), mod.dataUrl).toBe(true)
    expect(() => loadData(mod)).not.toThrow()
  })

  it('has every image and audio file the tasks use', () => {
    const missing = [...expectedFiles(mod, loadData(mod))]
      .filter(([path]) => !existsSync(join(PUBLIC, path)))
      .map(([path, reason]) => `${path} — ${reason}`)
    expect(missing).toEqual([])
  })

  it('has what each task needs to show a question', () => {
    const data = loadData(mod)
    const problems: string[] = []
    for (const task of mod.tasks) {
      const needs = (ok: boolean, what: string) => { if (!ok) problems.push(`${task.id} (${task.type}) needs ${what}`) }
      switch (task.type) {
        case 'revision':
          needs(data.items.length > 0, 'items')
          break
        case 'image-match':
        case 'audio-match':
        case 'sentence-match':
        case 'ingredient-match':
          // The right answer plus three others.
          needs(data.items.length >= 4, 'at least 4 items')
          break
        case 'product-match':
          needs((data.products ?? []).length > 0, 'products')
          break
        case 'diagram-label':
        case 'diagram-audio':
          needs((data.diagrams ?? []).some(d => d.hotspots.length > 0), 'a diagram with hotspots')
          break
        case 'sequence-order': {
          const sequence = task.sequenceId
            ? data.sequences?.find(s => s.id === task.sequenceId)
            : data.sequences?.[0]
          needs(!!sequence && sequence.steps.length > 1, `sequence "${task.sequenceId ?? '(first)'}" with steps`)
          break
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('has no duplicate item ids', () => {
    const ids = loadData(mod).items.map(item => item.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })
})
