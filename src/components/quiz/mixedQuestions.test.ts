import { describe, expect, it } from 'vitest'
import type { AllergenItem, ModuleData, ModuleDef, TaskDef, TaskType } from '../../types'
import { buildMixedQuiz, questionsForModule, type LoadedModule } from './mixedQuestions'

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
  it('takes five questions by default', () => {
    expect(questionsForModule(loaded(['image-match', 'audio-match']))).toHaveLength(5)
  })

  it('spreads them across the module\'s quiz types', () => {
    const types = new Set(questionsForModule(loaded(['image-match', 'audio-match'])).map((q) => q.type))
    expect(types).toEqual(new Set(['image-match', 'audio-match']))
  })

  it('asks about a different thing each time when the module has enough', () => {
    const asked = subjects(questionsForModule(loaded(['image-match', 'audio-match'])))
    expect(new Set(asked).size).toBe(5)
  })

  it('repeats a subject only when the module is too short not to', () => {
    const qs = questionsForModule(loaded(['image-match', 'audio-match'], {}, 3))
    expect(qs).toHaveLength(5)
    expect(new Set(subjects(qs)).size).toBe(3)
  })

  it('asks no more than a short module can offer at all', () => {
    const qs = questionsForModule(loaded(['image-match'], {}, 2))
    expect(qs).toHaveLength(2)
  })

  it('leaves out study guides and step-ordering tasks', () => {
    const qs = questionsForModule(loaded(['revision', 'image-match', 'sequence-order']))
    expect(qs.map((q) => q.type)).toEqual(Array(5).fill('image-match'))
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

  it('takes the asked-for number when it is not five', () => {
    expect(questionsForModule(loaded(['image-match']), 3)).toHaveLength(3)
  })
})

describe('buildMixedQuiz', () => {
  it('takes an equal share from every module', () => {
    const a = loaded(['image-match'])
    const b = { ...loaded(['audio-match']), mod: { ...loaded(['audio-match']).mod, id: 'other' } }
    const qs = buildMixedQuiz([a, b])
    expect(qs).toHaveLength(10)
    expect(qs.filter((q) => q.mod.id === 'test-module')).toHaveLength(5)
    expect(qs.filter((q) => q.mod.id === 'other')).toHaveLength(5)
  })

  it('interleaves the modules rather than asking them in turn', () => {
    const mods = ['a', 'b', 'c', 'd'].map((id) => {
      const l = loaded(['image-match'])
      return { ...l, mod: { ...l.mod, id } }
    })
    // Four modules of five, in order, would change module only three times.
    const order = buildMixedQuiz(mods).map((q) => q.mod.id)
    const changes = order.filter((id, i) => i > 0 && id !== order[i - 1]).length
    expect(changes).toBeGreaterThan(3)
  })

  it('has nothing to ask with no modules enabled', () => {
    expect(buildMixedQuiz([])).toEqual([])
  })
})
