import { describe, expect, it } from 'vitest'
import type { AllergenItem, ModuleData, ModuleDef, TaskDef, TaskType } from '../../types'
import { QUIZ_LENGTH, buildMixedQuiz, questionsForModule, type LoadedModule } from './mixedQuestions'

const items = (n: number): AllergenItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `item${i}`,
    name: `Item ${i}`,
    description: `Made with thing ${i}`,
    image: `item${i}.webp`,
    allergen: `Allergen ${i % 2}`,
  }))

function loaded(types: TaskType[], data: Partial<ModuleData> = {}, itemCount = 8): LoadedModule {
  const tasks: TaskDef[] = types.map((type, i) => ({ id: `task${i}`, type, title: type }))
  const mod: ModuleDef = {
    id: 'test-module',
    title: 'Test module',
    description: 'For the tests',
    dataUrl: '/content/test/data.json',
    imageBase: '/content/test/images/',
    audioBase: '/content/test/audio/',
    tasks,
  }
  return { mod, data: { id: 'test', title: 'Test', items: items(itemCount), ...data } }
}

const subjects = (qs: ReturnType<typeof questionsForModule>) =>
  qs.map((q) => ('answer' in q.question ? JSON.stringify(q.question.answer) : ''))

describe('questionsForModule', () => {
  it('spreads the questions across the module\'s quiz types', () => {
    const first = questionsForModule(loaded(['image-match', 'audio-match'])).slice(0, 4)
    expect(new Set(first.map((q) => q.type))).toEqual(new Set(['image-match', 'audio-match']))
  })

  it('asks about everything it can before asking about anything twice', () => {
    const qs = questionsForModule(loaded(['image-match', 'audio-match']))
    // Eight items, each askable by two quiz types: eight fresh, then repeats.
    expect(new Set(subjects(qs.slice(0, 8))).size).toBe(8)
    expect(qs).toHaveLength(16)
  })

  it('leaves out study guides and step-ordering tasks', () => {
    const qs = questionsForModule(loaded(['revision', 'image-match', 'sequence-order']))
    expect(new Set(qs.map((q) => q.type))).toEqual(new Set(['image-match']))
  })

  it('has nothing to ask for a module of study guides alone', () => {
    expect(questionsForModule(loaded(['revision']))).toEqual([])
  })

  it('leaves out an order quiz with no "none of them" option to offer', () => {
    const orders = [{ id: 'order0', text: 'a soya latte', item: 'item0' }]
    expect(questionsForModule(loaded(['order-match'], { orders }))).toEqual([])
  })

  it('carries the module each question came from', () => {
    const qs = questionsForModule(loaded(['image-match']))
    expect(qs.every((q) => q.mod.imageBase === '/content/test/images/')).toBe(true)
  })
})

/** Modules of their own, each with plenty to ask about. */
const modules = (...ids: string[]) =>
  ids.map((id) => {
    const l = loaded(['image-match', 'audio-match'], {}, 20)
    return { ...l, mod: { ...l.mod, id, title: id } }
  })

describe('buildMixedQuiz', () => {
  it('asks twenty-five questions', () => {
    expect(buildMixedQuiz(modules('a', 'b', 'c'))).toHaveLength(QUIZ_LENGTH)
  })

  it('shares them out as evenly as it can', () => {
    const qs = buildMixedQuiz(modules('a', 'b', 'c'))
    const counts = ['a', 'b', 'c'].map((id) => qs.filter((q) => q.mod.id === id).length)
    // Twenty-five across three: nine, eight and eight.
    expect(counts.sort()).toEqual([8, 8, 9])
  })

  it('takes the asked-for number when it is not twenty-five', () => {
    expect(buildMixedQuiz(modules('a', 'b'), 10)).toHaveLength(10)
  })

  it('takes more from the other modules when one runs short', () => {
    const short = { ...loaded(['image-match'], {}, 2), mod: { ...loaded(['image-match']).mod, id: 'short' } }
    const qs = buildMixedQuiz([short, ...modules('plenty')])
    expect(qs).toHaveLength(QUIZ_LENGTH)
    expect(qs.filter((q) => q.mod.id === 'short')).toHaveLength(2)
  })

  it('asks all there is when the modules cannot fill a quiz', () => {
    const small = { ...loaded(['image-match'], {}, 3), mod: { ...loaded(['image-match']).mod, id: 'small' } }
    expect(buildMixedQuiz([small])).toHaveLength(3)
  })

  it('interleaves the modules rather than asking them in turn', () => {
    const order = buildMixedQuiz(modules('a', 'b', 'c', 'd')).map((q) => q.mod.id)
    // Four modules asked one after another would change module three times.
    const changes = order.filter((id, i) => i > 0 && id !== order[i - 1]).length
    expect(changes).toBeGreaterThan(3)
  })

  it('has nothing to ask with no modules enabled', () => {
    expect(buildMixedQuiz([])).toEqual([])
  })
})
