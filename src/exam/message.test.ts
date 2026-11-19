import { describe, it, expect } from 'vitest'
import { FINAL_EXAM } from '../data/finalExam'
import {
  NO_NAME,
  SKIPPED,
  WA_ME_SAFE_ENCODED,
  answeredCount,
  buildMessage,
  unanswered,
  waMeLink,
} from './message'
import { ANSWER_LIMITS, type Exam } from './types'

const SITTING = new Date('2026-11-19T10:30:00')

/** Three questions is enough to check the shape of the message. */
const exam: Exam = {
  id: 'test-exam',
  title: 'Test exam',
  description: '',
  version: 'v1',
  intro: [],
  questions: [
    { id: 'a', ask: 'One?', show: { kind: 'none' }, answer: 'word' },
    { id: 'b', ask: 'Two?', show: { kind: 'none' }, answer: 'list' },
    { id: 'c', ask: 'Three?', show: { kind: 'none' }, answer: 'sentence' },
  ],
}

describe('buildMessage', () => {
  it('heads the message with the name, the date and the paper', () => {
    const message = buildMessage(exam, 'Fatima', { a: 'ciabatta' }, SITTING)
    expect(message.split('\n').slice(0, 3)).toEqual(['Test exam', 'Fatima', '19 Nov 2026 · v1'])
  })

  it('numbers one line per question, from 1', () => {
    const message = buildMessage(exam, 'Fatima', { a: 'one', b: 'two', c: 'three' }, SITTING)
    expect(message.split('\n').slice(4)).toEqual(['1 one', '2 two', '3 three'])
  })

  it('marks an answer left empty, so the list always reaches the last question', () => {
    const message = buildMessage(exam, 'Fatima', { a: 'one', c: '   ' }, SITTING)
    expect(message.split('\n').slice(4)).toEqual(['1 one', `2 ${SKIPPED}`, `3 ${SKIPPED}`])
  })

  it('puts a multi-line answer on one line, so a question can be found by counting', () => {
    const message = buildMessage(exam, 'Fatima', { b: 'coffee\nmilk\n\n  foam  ' }, SITTING)
    expect(message.split('\n').slice(4)).toContain('2 coffee milk foam')
    // One line per question, plus three header lines and the blank one.
    expect(message.split('\n')).toHaveLength(4 + exam.questions.length)
  })

  it('tidies the name, and still names someone who got past the start screen without one', () => {
    expect(buildMessage(exam, '  Fatima   Begum ', {}, SITTING).split('\n')[1]).toBe('Fatima Begum')
    expect(buildMessage(exam, '   ', {}, SITTING).split('\n')[1]).toBe(NO_NAME)
  })

  it('stays small enough to paste even if every answer is as long as it can be', () => {
    const full = Object.fromEntries(
      FINAL_EXAM.questions.map((q) => [q.id, 'x'.repeat(ANSWER_LIMITS[q.answer])])
    )
    const message = buildMessage(FINAL_EXAM, 'A Learner With A Long Name', full, SITTING)
    // Far inside WhatsApp's own 65,536, and inside anything a clipboard cares about.
    expect(message.length).toBeLessThan(2500)
  })
})

describe('counting answers', () => {
  it('counts only the questions with something in them', () => {
    expect(answeredCount(exam, { a: 'one', b: '  ', c: '\n' })).toBe(1)
    expect(unanswered(exam, { a: 'one' })).toEqual(['b', 'c'])
  })
})

describe('waMeLink', () => {
  it('makes a link with no phone number in it, so the tutor’s number stays private', () => {
    const link = waMeLink('1 ciabatta')
    expect(link).toBe('https://wa.me/?text=1%20ciabatta')
  })

  it('refuses a message too long to survive a URL, leaving copy-and-paste to do it', () => {
    // Newlines cost three characters each once encoded, which is what makes a
    // long message outgrow the URL well before it outgrows WhatsApp.
    const tooLong = 'a\n'.repeat(WA_ME_SAFE_ENCODED)
    expect(waMeLink(tooLong)).toBeNull()
  })
})

describe('the exam paper itself', () => {
  it('has unique question ids, which the message numbers depend on', () => {
    const ids = FINAL_EXAM.questions.map((q) => q.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it('asks a question and says how to answer it, every time', () => {
    for (const q of FINAL_EXAM.questions) {
      expect(q.ask.trim(), q.id).not.toBe('')
      expect(ANSWER_LIMITS[q.answer], q.id).toBeGreaterThan(0)
    }
  })
})
