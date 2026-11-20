// The exam's only output: one plain-text message the learner sends to their
// tutor on WhatsApp.
//
// Plain text, not JSON or base64, because a person reading it *is* the
// mechanism — anything encoded would need a decoder, which is a server by
// another name.
//
// Numbers only, no question text. The paper is fixed and the tutor has it, so
// repeating each question would roughly double the message for nothing, and a
// bare column is easier to read down on a phone.

import type { Exam } from './types'

/** Stands in for an answer the learner left empty, so the list always reaches 20. */
export const SKIPPED = '-'

/** What a learner is called in the message when they somehow started without a name. */
export const NO_NAME = 'No name'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Formatted by hand rather than with toLocaleDateString, so the message reads
// the same whatever the device's locale is set to, and tests don't depend on
// which ICU data the build has.
function formatDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** Whatever was typed, as one line: the tutor counts lines to find a question. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export interface Answers {
  [questionId: string]: string
}

/** How many questions have something in them. */
export function answeredCount(exam: Exam, answers: Answers): number {
  return exam.questions.filter((q) => oneLine(answers[q.id] ?? '') !== '').length
}

/** The questions left empty, in the order they were asked. */
export function unanswered(exam: Exam, answers: Answers): string[] {
  return exam.questions.filter((q) => oneLine(answers[q.id] ?? '') === '').map((q) => q.id)
}

/**
 * The message, ready to paste:
 *
 *     CafeFluent exam
 *     Fatima
 *     19 Nov 2026 · v1
 *
 *     1 ciabatta
 *     2 -
 *
 * The date and version say which sitting and which paper the answers belong to,
 * which costs eight characters and saves any doubt later.
 */
export function buildMessage(exam: Exam, name: string, answers: Answers, now: Date = new Date()): string {
  const lines = exam.questions.map((q, i) => `${i + 1} ${oneLine(answers[q.id] ?? '') || SKIPPED}`)
  return [
    exam.messageTitle,
    oneLine(name) || NO_NAME,
    `${formatDate(now)} · ${exam.version}`,
    '',
    ...lines,
  ].join('\n')
}
