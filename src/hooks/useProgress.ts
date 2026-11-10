import type { ProgressEntry } from '../types'

const key = (moduleId: string, taskId: string) =>
  `cafefluent/progress/${moduleId}/${taskId}`

export function getProgress(moduleId: string, taskId: string): ProgressEntry | null {
  try {
    const raw = localStorage.getItem(key(moduleId, taskId))
    return raw ? (JSON.parse(raw) as ProgressEntry) : null
  } catch {
    return null
  }
}

export function saveProgress(moduleId: string, taskId: string, entry: ProgressEntry) {
  localStorage.setItem(key(moduleId, taskId), JSON.stringify(entry))
}

const mixedKey = 'cafefluent/progress/mixed-quiz'

/**
 * The mixed quiz is meant to be taken again and again, and its length changes
 * as modules are enabled, so it keeps the last result and the best one rather
 * than a single score. "Best" is by percentage, for the same reason.
 */
export interface MixedProgress {
  last: ProgressEntry
  best: ProgressEntry
}

export function getMixedProgress(): MixedProgress | null {
  try {
    const raw = localStorage.getItem(mixedKey)
    return raw ? (JSON.parse(raw) as MixedProgress) : null
  } catch {
    return null
  }
}

export function saveMixedProgress(entry: ProgressEntry): MixedProgress {
  const share = (e: ProgressEntry) => (e.total > 0 ? e.score / e.total : 0)
  const previous = getMixedProgress()
  const best = previous && share(previous.best) >= share(entry) ? previous.best : entry
  const progress = { last: entry, best }
  localStorage.setItem(mixedKey, JSON.stringify(progress))
  return progress
}
