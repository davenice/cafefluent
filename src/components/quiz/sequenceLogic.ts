import { shuffle } from '../../utils/shuffle'

/** Move the element at `from` to position `to`, shifting the others. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Adjacency scoring. A step is right if it directly follows the step that
 * should precede it; the first step is right if it is the true first step.
 * A single misplaced step therefore costs two or three points rather than
 * turning everything after it wrong.
 */
export function scoreSequence(order: string[], correct: string[]): boolean[] {
  const pos = new Map(correct.map((id, i) => [id, i]))
  return order.map((id, i) => {
    const p = pos.get(id)
    if (p === undefined) return false
    if (i === 0) return p === 0
    return pos.get(order[i - 1]) === p - 1
  })
}

/**
 * Shuffle so that no step starts out directly after its correct predecessor,
 * otherwise the task partly gives itself away. Falls back to a plain shuffle
 * if a clean one isn't found quickly (only possible for very short lists).
 */
export function shuffleSteps(correct: string[], attempts = 50): string[] {
  let result = shuffle(correct)
  for (let i = 0; i < attempts; i++) {
    if (!scoreSequence(result, correct).some(Boolean)) return result
    result = shuffle(correct)
  }
  return result
}
