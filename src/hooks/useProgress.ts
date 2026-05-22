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
