import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMixedProgress, getProgress, saveMixedProgress, saveProgress } from './useProgress'

const entry = (score: number, total: number) => ({
  score,
  total,
  completedAt: '2026-11-10T10:00:00.000Z',
})

// Node's own localStorage shadows jsdom's and is unusable without a file, so use a simple one.
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('a task\'s progress', () => {
  it('comes back as it was saved', () => {
    saveProgress('bread', 'task1', entry(8, 10))
    expect(getProgress('bread', 'task1')).toEqual(entry(8, 10))
  })

  it('is nothing until the task is done', () => {
    expect(getProgress('bread', 'task1')).toBeNull()
  })
})

describe('the mixed quiz\'s progress', () => {
  it('is nothing until the quiz is taken', () => {
    expect(getMixedProgress()).toBeNull()
  })

  it('keeps the first result as both last and best', () => {
    expect(saveMixedProgress(entry(12, 20))).toEqual({ last: entry(12, 20), best: entry(12, 20) })
  })

  it('keeps a better result as the best', () => {
    saveMixedProgress(entry(12, 20))
    saveMixedProgress(entry(18, 20))
    expect(getMixedProgress()).toEqual({ last: entry(18, 20), best: entry(18, 20) })
  })

  it('keeps the best when the latest result is worse', () => {
    saveMixedProgress(entry(18, 20))
    saveMixedProgress(entry(4, 20))
    expect(getMixedProgress()).toEqual({ last: entry(4, 20), best: entry(18, 20) })
  })

  it('compares results of different lengths by share, not score', () => {
    saveMixedProgress(entry(20, 40))
    // Fewer right, but out of a quiz half the length.
    saveMixedProgress(entry(15, 20))
    expect(getMixedProgress()?.best).toEqual(entry(15, 20))
  })
})
