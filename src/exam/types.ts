// The final exam's shape. Kept here rather than in src/types/index.ts while the
// exam is a dev-only page, so nothing the learner app imports has to change.

/** How much the learner is expected to write. Sets the kind of box and its cap. */
export type AnswerKind = 'word' | 'line' | 'sentence' | 'list'

/**
 * The most a learner can type, per answer kind. Generous on purpose: a cap that
 * cuts off a right answer would be marked wrong for the wrong reason, and the
 * longest item name in the content today is 26 characters ("Scone (with jam and
 * cream)"). The real instruction is the question's `guidance`, not the limit.
 */
export const ANSWER_LIMITS: Record<AnswerKind, number> = {
  word: 40,
  line: 80,
  sentence: 200,
  list: 200,
}

/** A box this tall, in rows. One line for the short kinds. */
export const ANSWER_ROWS: Record<AnswerKind, number> = {
  word: 1,
  line: 1,
  sentence: 4,
  list: 5,
}

/**
 * What the learner is shown with the question. Everything points at content a
 * module already owns, by id — never by path — so a re-shot or renamed picture
 * keeps working, while an item that is deleted breaks the content test loudly.
 */
export type Prompt =
  | { kind: 'item-image'; module: string; item: string }
  | { kind: 'product-image'; module: string; product: string }
  | { kind: 'item-audio'; module: string; item: string; variant?: string }
  | { kind: 'order-audio'; module: string; order: string }
  | { kind: 'none' }

export interface ExamQuestion {
  /** Stable for ever: it is the number the sent message carries. */
  id: string
  /** The question, at B1. */
  ask: string
  /**
   * How to answer — "Write each thing on a new line." Not what the answer is,
   * and **never how long it should be**: the names on the paper run from one
   * word ("Sesame") to five ("Scone (with jam and cream)"), so a hint about
   * length makes a right answer look wrong to the person writing it.
   */
  guidance?: string
  show: Prompt
  answer: AnswerKind
}

export interface Exam {
  /** Switched on and off under this id, like a module. */
  id: string
  /** On the home page, the admin page and the exam itself. */
  title: string
  description: string
  /**
   * The first line of the sent message. Names the app rather than the exam, so
   * the course leader can tell what it is in a WhatsApp thread full of chat.
   */
  messageTitle: string
  /** Bumped if the questions ever change, so a message says which paper it answers. */
  version: string
  /** The start screen, a paragraph per line. */
  intro: string[]
  questions: ExamQuestion[]
}
