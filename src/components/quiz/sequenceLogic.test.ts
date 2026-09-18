import { describe, it, expect } from 'vitest'
import { moveItem, scoreSequence, shuffleSteps } from './sequenceLogic'

const correct = ['a', 'b', 'c', 'd', 'e']

describe('moveItem', () => {
  it('moves an item down, shifting the others up', () => {
    expect(moveItem(correct, 0, 2)).toEqual(['b', 'c', 'a', 'd', 'e'])
  })
  it('moves an item up, shifting the others down', () => {
    expect(moveItem(correct, 4, 1)).toEqual(['a', 'e', 'b', 'c', 'd'])
  })
  it('returns the same array when nothing moves', () => {
    expect(moveItem(correct, 2, 2)).toBe(correct)
  })
})

describe('scoreSequence', () => {
  it('marks everything right for the correct order', () => {
    expect(scoreSequence(correct, correct)).toEqual([true, true, true, true, true])
  })
  it('only penalises the neighbours of a single misplaced step', () => {
    // c pulled out and dropped at the end: b→d is broken, c no longer follows b.
    expect(scoreSequence(['a', 'b', 'd', 'e', 'c'], correct)).toEqual([true, true, false, true, false])
  })
  it('marks the first card wrong unless it is the true first step', () => {
    expect(scoreSequence(['b', 'c', 'd', 'e', 'a'], correct)).toEqual([false, true, true, true, false])
  })
  it('scores nothing for a fully reversed list', () => {
    expect(scoreSequence([...correct].reverse(), correct)).toEqual([false, false, false, false, false])
  })
})

describe('shuffleSteps', () => {
  it('never leaves a step directly after its correct predecessor', () => {
    for (let i = 0; i < 30; i++) {
      const shuffled = shuffleSteps(correct)
      expect([...shuffled].sort()).toEqual(correct)
      expect(scoreSequence(shuffled, correct).some(Boolean)).toBe(false)
    }
  })
})
