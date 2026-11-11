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

/**
 * How a task is answered: its quiz type, and any task option that changes the
 * answers on screen. Used as a test name, so it reads as the quiz it describes.
 */
export function variantOf({ task }: QuizTask): string {
  return task.answerWith ? `${task.type} (${task.answerWith})` : task.type
}

/**
 * The first task of each quiz type, so each quiz component is driven once —
 * once per variant, since a type that can be answered two ways is two screens.
 */
export function oneTaskPerType(): QuizTask[] {
  const seen = new Set<string>()
  return ALL_TASKS.filter(t =>
    t.task.type !== 'revision' && !seen.has(variantOf(t)) && seen.add(variantOf(t)))
}

export function sequenceFor({ task, data }: QuizTask) {
  return task.sequenceId ? data.sequences!.find(s => s.id === task.sequenceId)! : data.sequences![0]
}

/** How many questions the quiz asks, which is the total on the score screen. */
export function questionCount(quiz: QuizTask): number {
  const { task, data } = quiz
  switch (task.type) {
    case 'product-match': return data.products!.length
    case 'order-match': return data.orders!.length
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
    case 'allergen-match': {
      const texts = await paragraphs()
      return byName(data.items.find(i => texts.includes(i.name))!.allergen!)
    }
    case 'order-match': {
      const id = audioId(await newAudio(page, audioSeen), data.orders!.map(o => o.id))
      const order = data.orders!.find(o => o.id === id)!
      // The order names one of the milks, or none of them.
      const item = data.items.find(i => i.id === order.item)
      return byName(item ? item.name : data.noneOption!.name)
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
 * The mixed quiz is showing a question. Wait for this after goto, and before
 * answering: the answering loop moves the clock on while it waits, which would
 * otherwise swallow the first question's audio before the test looks for it.
 */
export async function waitForMixedQuiz(page: Page) {
  await expect(main(page).getByTestId('mixed-question')).toBeVisible()
}

/**
 * The module and task the mixed quiz's current question came from, which the
 * page names on the question itself. Every question may be from a different one.
 */
export async function currentMixedQuiz(page: Page): Promise<QuizTask> {
  const question = main(page).getByTestId('mixed-question')
  await expect(question).toBeVisible()
  const modId = await question.getAttribute('data-module')
  const taskId = await question.getAttribute('data-task')
  const mod = MODULES.find(m => m.id === modId)
  if (!mod) throw new Error(`The mixed quiz asked about unknown module ${modId}`)
  const task = mod.tasks.find(t => t.id === taskId)
  if (!task) throw new Error(`The mixed quiz asked ${mod.id}'s unknown task ${taskId}`)
  return { mod, task, data: loadData(mod) }
}

/**
 * Answers every question, right or wrong, until the score screen shows.
 * Needs `pauseClock(page)` before the page loads: the clock is moved on past
 * the pause after each answer instead of waiting for it.
 */
export async function completeQuiz(page: Page, quiz: QuizTask, { correct }: { correct: boolean }) {
  if (quiz.task.type === 'sequence-order') return completeSequence(page, quiz, { correct })
  return answerUntilScore(page, async () => quiz, { correct })
}

/**
 * The same, for the mixed quiz: the quiz each question belongs to is read off
 * the page, since it changes from question to question.
 */
export async function completeMixedQuiz(page: Page, { correct }: { correct: boolean }) {
  await waitForMixedQuiz(page)
  return answerUntilScore(page, () => currentMixedQuiz(page), { correct })
}

async function answerUntilScore(
  page: Page,
  quizOf: () => Promise<QuizTask>,
  { correct }: { correct: boolean }
) {
  const tryAgain = page.getByRole('button', { name: 'Try again' })
  for (;;) {
    await expect.poll(async () => {
      if (await tryAgain.count() || await answerButtons(page).count()) return true
      await page.clock.runFor(500)
      return false
    }, { intervals: [20] }).toBe(true)
    if (await tryAgain.count()) return

    const quiz = await quizOf()
    const seen = (await audioSrcs(page)).length
    const button = correct
      ? (await correctAnswer(page, quiz, seen)).button
      : await wrongAnswer(page, quiz, seen)
    await button.click()
    // Past the longest pause after an answer.
    await page.clock.runFor(2500)
  }
}

/** A step's drag handle, which is also how the step is moved with the keyboard. */
export const stepHandle = (page: Page, text: string) =>
  main(page).getByRole('button', { name: `Drag to reorder: ${text}`, exact: true })

/** Where the step sits in the list now, counting from 1. */
async function stepPosition(page: Page, text: string): Promise<number> {
  return Number(await stepHandle(page, text).locator('..').getAttribute('data-position'))
}

/** Puts every step of a `sequence-order` quiz in its right place, with the keyboard. */
export async function orderSequence(page: Page, quiz: QuizTask) {
  for (const [i, step] of sequenceFor(quiz).steps.entries()) {
    const handle = stepHandle(page, step.text)
    const position = await stepPosition(page, step.text)
    for (let p = position - 1; p > i; p--) await handle.press('ArrowUp')
  }
}

async function completeSequence(page: Page, quiz: QuizTask, { correct }: { correct: boolean }) {
  // The steps start shuffled so that none follows the step it should, so
  // leaving them alone scores 0.
  if (correct) await orderSequence(page, quiz)
  await page.getByRole('button', { name: 'Check my order' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
}
