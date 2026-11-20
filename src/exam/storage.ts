// What the learner has typed so far, kept in the browser.
//
// The exam is half an hour of typing on a phone, so a dropped connection, a
// phone call, or the browser evicting a backgrounded page must not cost the
// lot. Everything is written as it is typed and read back on the next visit.
//
// Nothing here can throw: localStorage is refused outright in a private window
// and with site data blocked, and a learner mid-exam is the worst possible
// moment to find that out.

import type { Answers } from './message'

const KEY = 'cafefluent/final-exam'

export interface ExamProgress {
  name: string
  answers: Answers
  /** Set when the learner says they have sent their answers. Their word, not ours. */
  sent: boolean
}

export const EMPTY: ExamProgress = { name: '', answers: {}, sent: false }

export function load(): ExamProgress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const saved = JSON.parse(raw) as Partial<ExamProgress>
    return {
      name: typeof saved.name === 'string' ? saved.name : '',
      // Anything that isn't a string is dropped rather than shown back as "[object Object]".
      answers: Object.fromEntries(
        Object.entries(saved.answers ?? {}).filter(([, v]) => typeof v === 'string')
      ) as Answers,
      sent: saved.sent === true,
    }
  } catch {
    return EMPTY
  }
}

export function save(progress: ExamProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Nothing to do: the page holds the answers in memory either way, and the
    // message on screen is what actually gets sent.
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // As above.
  }
}

/** Whether anything was typed before this visit, so the page can say it kept it. */
export function hasWork(progress: ExamProgress): boolean {
  return progress.name !== '' || Object.values(progress.answers).some((a) => a.trim() !== '')
}
