import type { ModuleData, ModuleDef, TaskDef, TaskType } from '../../types'
import { shuffle } from '../../utils/shuffle'
import {
  buildAllergenQuestions,
  buildAudioQuestions,
  buildDiagramAudioQuestions,
  buildDiagramQuestions,
  buildImageQuestions,
  buildIngredientQuestions,
  buildOrderQuestions,
  buildProductQuestions,
  buildSentenceQuestions,
  type AllergenQuestion,
  type AudioQuestion,
  type DiagramQuestion,
  type HotspotAudioQuestion,
  type ImageQuestion,
  type IngredientQuestion,
  type OrderQuestion,
  type ProductQuestion,
  type SentenceQuestion,
} from './questionBuilders'
import { SENTENCE_VARIANTS, type SentenceVariant } from '../../data/sentenceVariants'

/**
 * How many questions a mixed quiz aims for, however many modules are enabled.
 * The share comes out as evenly as the modules' content allows.
 */
export const QUIZ_LENGTH = 25

/**
 * The task types the mixed quiz leaves out: a study guide asks nothing, and one
 * run of `sequence-order` scores out of its number of steps, so it cannot be
 * one question among many. `questionsForTask` returns nothing for both.
 */
const NOT_MIXED: TaskType[] = ['revision', 'sequence-order']

/** Whether the mixed quiz can draw anything at all from a module. */
export function isMixable(mod: ModuleDef): boolean {
  return mod.tasks.some((task) => !NOT_MIXED.includes(task.type))
}

/** A module's content, loaded and ready to draw questions from. */
export interface LoadedModule {
  mod: ModuleDef
  data: ModuleData
}

/**
 * One question, carrying the module it came from: the renderers need that
 * module's images, audio and look, which differ from question to question.
 * `type` matches the task type, so the page can pick the renderer.
 */
export type MixedQuestion = { mod: ModuleDef; task: TaskDef } & (
  | { type: 'image-match'; question: ImageQuestion }
  | { type: 'audio-match'; question: AudioQuestion }
  | { type: 'sentence-match'; question: SentenceQuestion<SentenceVariant> }
  | { type: 'product-match'; question: ProductQuestion }
  | { type: 'diagram-label'; question: DiagramQuestion }
  | { type: 'diagram-audio'; question: HotspotAudioQuestion }
  | { type: 'ingredient-match'; question: IngredientQuestion }
  | { type: 'allergen-match'; question: AllergenQuestion }
  | { type: 'order-match'; question: OrderQuestion }
)

/** Every question a task could ask, in the builder's own random order. */
function questionsForTask({ mod, data }: LoadedModule, task: TaskDef): MixedQuestion[] {
  const of = <T extends MixedQuestion['type'], Q>(type: T, questions: Q[]) =>
    questions.map((question) => ({ mod, task, type, question }) as MixedQuestion)

  switch (task.type) {
    case 'image-match':
      return of('image-match', buildImageQuestions(data.items))
    case 'audio-match':
      return of('audio-match', buildAudioQuestions(data.items, task.audioVariants ?? ['name']))
    case 'sentence-match':
      return of('sentence-match', buildSentenceQuestions(data.items, SENTENCE_VARIANTS))
    case 'product-match':
      return of('product-match', buildProductQuestions(data.products ?? []))
    case 'diagram-label':
      return of('diagram-label', buildDiagramQuestions(data.diagrams ?? []))
    case 'diagram-audio':
      return of('diagram-audio', buildDiagramAudioQuestions(data.diagrams ?? []))
    case 'ingredient-match':
      return of('ingredient-match', buildIngredientQuestions(data.items))
    case 'allergen-match':
      return of('allergen-match', buildAllergenQuestions(data.items))
    case 'order-match':
      return data.noneOption
        ? of('order-match', buildOrderQuestions(data.orders ?? [], data.items, data.noneOption))
        : []
    // See NOT_MIXED.
    case 'revision':
    case 'sequence-order':
      return []
  }
}

/** What the question is about, so the same milk isn't asked about twice. */
function subject(q: MixedQuestion): string {
  switch (q.type) {
    case 'product-match': return q.question.product.id
    case 'diagram-label': return `${q.question.diagramTitle}/${q.question.answer}`
    case 'diagram-audio': return q.question.answer.id
    case 'order-match': return q.question.order.id
    default: return q.question.answer.id
  }
}

/**
 * All of one module's questions, in the order the mixed quiz should take them:
 * a round of its quiz types, then another, so a module's share is spread across
 * them rather than taken from one. Every subject it can ask about comes before
 * any repeat, so a quiz only asks about the same bread twice if it must.
 */
export function questionsForModule(loaded: LoadedModule): MixedQuestion[] {
  const pools = shuffle(loaded.mod.tasks)
    .map((task) => questionsForTask(loaded, task))
    .filter((pool) => pool.length > 0)

  const ordered: MixedQuestion[] = []
  const asked = new Set<string>()
  for (const freshOnly of [true, false]) {
    for (;;) {
      const before = ordered.length
      for (const pool of pools) {
        const at = pool.findIndex((q) => !freshOnly || !asked.has(subject(q)))
        if (at === -1) continue
        const [question] = pool.splice(at, 1)
        asked.add(subject(question))
        ordered.push(question)
      }
      if (ordered.length === before) break
    }
  }
  return ordered
}

/**
 * A quiz of `length` questions, dealt a round at a time from each module so the
 * share is as even as the content allows: a module with little to ask leaves
 * its place to the others rather than making the quiz short. The result is
 * shuffled, so the modules are interleaved rather than asked one after another.
 */
export function buildMixedQuiz(modules: LoadedModule[], length = QUIZ_LENGTH): MixedQuestion[] {
  const pools = shuffle(modules).map(questionsForModule)
  const taken: MixedQuestion[] = []

  for (let round = 0; taken.length < length; round++) {
    const before = taken.length
    for (const pool of pools) {
      if (taken.length >= length) break
      if (round < pool.length) taken.push(pool[round])
    }
    // Every pool is used up.
    if (taken.length === before) break
  }
  return shuffle(taken)
}
