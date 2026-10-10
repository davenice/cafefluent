import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'
import { MODULES } from '../../src/data/modules'
import type { ModuleData, ModuleDef, TaskDef, TaskType } from '../../src/types'
import { audioSrcs } from '../fixtures'

export interface QuizTask {
  mod: ModuleDef
  task: TaskDef
  data: ModuleData
}

const PUBLIC = join(import.meta.dirname, '..', '..', 'public')

export function loadData(mod: ModuleDef): ModuleData {
  return JSON.parse(readFileSync(join(PUBLIC, mod.dataUrl), 'utf8'))
}

export const ALL_TASKS: QuizTask[] = MODULES.flatMap(mod => {
  const data = loadData(mod)
  return mod.tasks.map(task => ({ mod, task, data }))
})

export function tasksOfType(...types: TaskType[]): QuizTask[] {
  return ALL_TASKS.filter(t => types.includes(t.task.type))
}

/** The first task of each quiz type, so each quiz component is driven once. */
export function oneTaskPerType(): QuizTask[] {
  const seen = new Set<TaskType>()
  return ALL_TASKS.filter(t => t.task.type !== 'revision' && !seen.has(t.task.type) && seen.add(t.task.type))
}

export function sequenceFor({ task, data }: QuizTask) {
  return task.sequenceId ? data.sequences!.find(s => s.id === task.sequenceId)! : data.sequences![0]
}

/** How many questions the quiz asks, which is the total on the score screen. */
export function questionCount(quiz: QuizTask): number {
  const { task, data } = quiz
  switch (task.type) {
    case 'product-match': return data.products!.length
    case 'diagram-label':
    case 'diagram-audio': return data.diagrams!.reduce((n, d) => n + d.hotspots.length, 0)
    case 'sequence-order': return sequenceFor(quiz).steps.length
    default: return data.items.length
  }
}

const main = (page: Page) => page.getByRole('main')

/** The answer buttons of the current question, while it can be answered. */
export const answerButtons = (page: Page) =>
  main(page).locator('button:enabled:not([aria-label="Play audio"]):not([aria-label="Playing…"])')

/**
 * The quiz is waiting for an answer, or showing its first screen.
 * The quiz page loads data before showing anything, so wait for this after goto.
 */
export async function waitForQuiz(page: Page, { task }: QuizTask) {
  if (task.type === 'revision') {
    await expect(page.getByRole('button', { name: 'Mark revision complete' })).toBeVisible()
  } else if (task.type === 'sequence-order') {
    await expect(page.getByRole('button', { name: 'Check my order' })).toBeVisible()
  } else {
    await expect(answerButtons(page).first()).toBeVisible()
  }
}

/**
 * The audio file for the current question. Audio starts 300ms after a question
 * appears, so this moves the clock on until a new file is asked for.
 */
async function newAudio(page: Page, seenBefore: number): Promise<string> {
  let srcs: string[] = []
  await expect.poll(async () => {
    srcs = await audioSrcs(page)
    if (srcs.length > seenBefore) return true
    await page.clock.runFor(100)
    return false
  }, { intervals: [20] }).toBe(true)
  return srcs[srcs.length - 1]
}

/** The item or hotspot id in an audio file name: `<id>_<variant>.mp3`. */
function audioId(src: string, ids: string[]): string {
  const file = src.split('/').pop()!
  const match = ids.filter(id => file.startsWith(`${id}_`)).sort((a, b) => b.length - a.length)[0]
  if (!match) throw new Error(`No id matches audio file ${src}`)
  return match
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** An answer button by its name, which gains a ✓ or ✗ once the question is answered. */
const answerNamed = (page: Page, name: string) =>
  main(page).getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}( [✓✗])?$`) })

async function nameOf(button: Locator): Promise<string> {
  const text = (await button.textContent())?.trim()
  return text || (await button.locator('img').getAttribute('alt')) || ''
}

/** Works out the right answer to the current question from what's on screen and the module's data. */
export async function correctAnswer(page: Page, quiz: QuizTask, audioSeen = 0): Promise<{ button: Locator, name: string }> {
  const { task, data } = quiz
  const byName = (name: string) => ({ button: answerNamed(page, name), name })
  const paragraphs = () => main(page).locator('p').allTextContents()

  switch (task.type) {
    case 'image-match': {
      const prompt = main(page).getByTestId('prompt-image')
      if (await prompt.count()) {
        const src = (await prompt.getAttribute('src'))!
        return byName(data.items.find(i => src.endsWith(`/${i.image}`))!.name)
      }
      const texts = await paragraphs()
      return byName(data.items.find(i => texts.includes(i.name))!.name)
    }
    case 'ingredient-match': {
      const texts = await paragraphs()
      return byName(data.items.find(i => texts.includes(i.description))!.name)
    }
    case 'audio-match':
    case 'sentence-match': {
      const id = audioId(await newAudio(page, audioSeen), data.items.map(i => i.id))
      return byName(data.items.find(i => i.id === id)!.name)
    }
    case 'product-match': {
      const src = (await main(page).locator('img').first().getAttribute('src'))!
      return byName(data.products!.find(p => src.endsWith(`/${p.image}`))!.name)
    }
    case 'diagram-label': {
      const title = (await main(page).locator('img').first().getAttribute('alt'))!
      // The marker is the element positioned in percent over the diagram.
      const [x, y] = await main(page).locator('img').first().evaluate(img => {
        const marker = [...img.parentElement!.children].find(el => (el as HTMLElement).style.left.endsWith('%')) as HTMLElement
        return [parseFloat(marker.style.left), parseFloat(marker.style.top)]
      })
      const diagram = data.diagrams!.find(d => d.title === title)!
      return byName(diagram.hotspots.find(h => h.x === x && h.y === y)!.label)
    }
    case 'diagram-audio': {
      const hotspots = data.diagrams!.flatMap(d => d.hotspots)
      const id = audioId(await newAudio(page, audioSeen), hotspots.map(h => h.id))
      return { button: main(page).getByTestId(`hotspot-${id}`), name: hotspots.find(h => h.id === id)!.label }
    }
    default:
      throw new Error(`No answer strategy for ${task.type}`)
  }
}

/** Any answer to the current question except the right one. */
export async function wrongAnswer(page: Page, quiz: QuizTask, audioSeen = 0): Promise<Locator> {
  const right = await correctAnswer(page, quiz, audioSeen)
  if (quiz.task.type === 'diagram-audio') {
    const rightId = await right.button.getAttribute('data-testid')
    return main(page).locator(`[data-testid^="hotspot-"]:not([data-testid="${rightId}"])`).first()
  }
  for (const button of await answerButtons(page).all()) {
    const name = await nameOf(button)
    // By name, since the button stops matching answerButtons once it's disabled.
    if (name !== right.name) return answerNamed(page, name)
  }
  throw new Error('No wrong answer on screen')
}

/**
 * Answers every question, right or wrong, until the score screen shows.
 * Needs `pauseClock(page)` before the page loads: the clock is moved on past
 * the pause after each answer instead of waiting for it.
 */
export async function completeQuiz(page: Page, quiz: QuizTask, { correct }: { correct: boolean }) {
  if (quiz.task.type === 'sequence-order') return completeSequence(page, quiz, { correct })

  const tryAgain = page.getByRole('button', { name: 'Try again' })
  for (;;) {
    await expect.poll(async () => {
      if (await tryAgain.count() || await answerButtons(page).count()) return true
      await page.clock.runFor(500)
      return false
    }, { intervals: [20] }).toBe(true)
    if (await tryAgain.count()) return

    const seen = (await audioSrcs(page)).length
    const button = correct
      ? (await correctAnswer(page, quiz, seen)).button
      : await wrongAnswer(page, quiz, seen)
    await button.click()
    // Past the longest pause after an answer.
    await page.clock.runFor(2500)
  }
}

async function completeSequence(page: Page, quiz: QuizTask, { correct }: { correct: boolean }) {
  const steps = sequenceFor(quiz).steps
  // The steps start shuffled so that none is in the right place, so leaving
  // them alone scores 0.
  if (correct) {
    for (const [i, step] of steps.entries()) {
      const handle = main(page).getByRole('button', { name: `Drag to reorder: ${step.text}`, exact: true })
      const position = Number(await handle.locator('..').getAttribute('data-position'))
      for (let p = position - 1; p > i; p--) await handle.press('ArrowUp')
    }
  }
  await page.getByRole('button', { name: 'Check my order' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
}
