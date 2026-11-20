// Turning an exam question's reference into something to show.
//
// Questions name content by module and item id, never by path, so the picture a
// question shows is whatever that item's `data.json` currently points at. The
// modules' data files are fetched once, before the exam starts — finding a dead
// reference at question 14 is the worst outcome this feature has, so it is
// checked up front and the exam refuses to begin instead.

import { MODULES } from '../data/modules'
import type { ModuleData, ModuleDef } from '../types'
import type { ExamQuestion, Prompt } from './types'

export type LoadedModules = Record<string, ModuleData>

/** Every module the questions point at, each once. */
export function referencedModules(questions: ExamQuestion[]): string[] {
  const ids = questions.map((q) => ('module' in q.show ? q.show.module : null)).filter((id): id is string => id !== null)
  return [...new Set(ids)]
}

export function moduleDef(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id)
}

/**
 * Fetch each module's data, the same way QuizShell does. Rejects if any of them
 * fails, so the caller can say the exam can't be opened rather than start one
 * that will break part way through.
 */
export async function loadModules(ids: string[]): Promise<LoadedModules> {
  const loaded = await Promise.all(
    ids.map(async (id) => {
      const mod = moduleDef(id)
      if (!mod) throw new Error(`The exam needs the "${id}" module, which this app does not have.`)
      const res = await fetch(mod.dataUrl)
      if (!res.ok) throw new Error(`Could not load ${mod.dataUrl} (${res.status}).`)
      return [id, (await res.json()) as ModuleData] as const
    })
  )
  return Object.fromEntries(loaded)
}

/** What a question shows: a picture, a sound, or nothing. */
export interface ResolvedPrompt {
  image?: { src: string; fit: 'cover' | 'contain' }
  audio?: string
}

/**
 * The picture or sound for one question, or null if its reference does not
 * resolve. Callers show the question without its prompt rather than crashing;
 * `referenceProblems` is what stops that happening in the first place.
 */
export function resolvePrompt(show: Prompt, loaded: LoadedModules): ResolvedPrompt | null {
  if (show.kind === 'none') return {}

  const mod = moduleDef(show.module)
  const data = loaded[show.module]
  if (!mod || !data) return null
  const fit = mod.imageFit ?? 'cover'

  switch (show.kind) {
    case 'item-image': {
      const item = data.items.find((i) => i.id === show.item)
      return item ? { image: { src: `${mod.imageBase}${item.image}`, fit } } : null
    }
    case 'product-image': {
      const product = data.products?.find((p) => p.id === show.product)
      return product ? { image: { src: `${mod.imageBase}${product.image}`, fit } } : null
    }
    case 'item-audio': {
      const item = data.items.find((i) => i.id === show.item)
      if (!item || !mod.audioBase) return null
      return { audio: `${mod.audioBase}${item.id}_${show.variant ?? 'name'}.mp3` }
    }
    case 'order-audio': {
      const order = data.orders?.find((o) => o.id === show.order)
      if (!order || !mod.audioBase) return null
      // Spoken orders are generated like an item's name clip; see "Generating audio".
      return { audio: `${mod.audioBase}${order.id}_name.mp3` }
    }
  }
}

/**
 * Anything the exam points at that isn't there, said in the exam's own terms.
 * Used by the page to refuse to start, and by the content test to fail a build.
 */
export function referenceProblems(questions: ExamQuestion[], loaded: LoadedModules): string[] {
  const problems: string[] = []
  for (const q of questions) {
    if (resolvePrompt(q.show, loaded) === null) {
      const where = 'module' in q.show ? `${q.show.module}/${reference(q.show)}` : q.show.kind
      problems.push(`${q.id} points at ${where}, which is not there any more`)
    }
  }
  return problems
}

function reference(show: Prompt): string {
  if ('item' in show) return show.item
  if ('product' in show) return show.product
  if ('order' in show) return show.order
  return show.kind
}
