// @vitest-environment node
// Checks that every file the app will ask for exists in public/content: data
// files, images and audio. Runs with `npm test`, or alone with `npm run check:content`.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { MODULES } from '../src/data/modules'
import { SENTENCE_VARIANTS } from '../src/data/sentenceVariants'
import type { ModuleData, ModuleDef } from '../src/types'
import { FINAL_EXAM } from '../src/data/finalExam'
import { referenceProblems, referencedModules, resolvePrompt, type LoadedModules } from '../src/exam/content'
import { ANSWER_LIMITS } from '../src/exam/types'

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
      case 'order-match':
        // One spoken order per clip, named like an item's: `<id>_name.mp3`.
        for (const order of data.orders ?? []) {
          add(`${audioBase}${order.id}_name.mp3`, why(`audio for order "${order.id}"`))
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
        case 'allergen-match': {
          // The right allergen plus three others, which come from the items themselves.
          const allergens = new Set(data.items.map(item => item.allergen).filter(Boolean))
          needs(data.items.every(item => !!item.allergen), 'an allergen on every item')
          needs(allergens.size >= 4, 'at least 4 different allergens')
          break
        }
        case 'order-match': {
          const orders = data.orders ?? []
          needs(orders.length > 0, 'orders')
          needs(!!data.noneOption, 'a noneOption for an order naming no item')
          // The answer, the noneOption and two other items.
          needs(data.items.length >= 3, 'at least 3 items')
          const ids = new Set([...data.items.map(i => i.id), data.noneOption?.id])
          const unknown = orders.filter(o => !ids.has(o.item)).map(o => o.id)
          needs(unknown.length === 0, `orders to name a known item (${unknown.join(', ')})`)
          break
        }
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

// --- The final exam ---------------------------------------------------------
// The exam points at module content by id rather than by path, so the thing to
// check is that every item, product and order it names is still there, and that
// the picture or sound it resolves to is on disk. An item deleted from a module
// should fail here, loudly and in the exam's own words — not in front of a
// learner sitting the paper.

describe('final exam', () => {
  const loaded: LoadedModules = Object.fromEntries(
    referencedModules(FINAL_EXAM.questions).map(id => {
      const mod = MODULES.find(m => m.id === id)
      if (!mod) throw new Error(`the exam names the "${id}" module, which this app does not have`)
      return [id, loadData(mod)]
    })
  )

  it('names only content that still exists', () => {
    expect(referenceProblems(FINAL_EXAM.questions, loaded)).toEqual([])
  })

  it('has every picture and sound it will ask for', () => {
    const missing: string[] = []
    for (const question of FINAL_EXAM.questions) {
      const prompt = resolvePrompt(question.show, loaded)
      for (const path of [prompt?.image?.src, prompt?.audio]) {
        if (path && !existsSync(join(PUBLIC, path))) missing.push(`${path} — ${question.id}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('has no duplicate question ids, which the sent message numbers by position', () => {
    const ids = FINAL_EXAM.questions.map(q => q.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it('asks something, and says how long an answer should be, every time', () => {
    const problems = FINAL_EXAM.questions
      .filter(q => q.ask.trim() === '' || !(q.answer in ANSWER_LIMITS))
      .map(q => q.id)
    expect(problems).toEqual([])
  })
})
