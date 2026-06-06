import { describe, it, expect } from 'vitest'
import { shuffle, pickRandom } from './shuffle'

describe('shuffle', () => {
  it('returns an array with the same elements', () => {
    const arr = [1, 2, 3, 4, 5]
    const result = shuffle(arr)
    expect(result).toHaveLength(arr.length)
    expect([...result].sort()).toEqual([...arr].sort())
  })

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3]
    const copy = [...arr]
    shuffle(arr)
    expect(arr).toEqual(copy)
  })
})

describe('pickRandom', () => {
  const pool = ['a', 'b', 'c', 'd', 'e']

  it('returns exactly n items', () => {
    expect(pickRandom(pool, 3)).toHaveLength(3)
  })

  it('never includes the excluded item', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickRandom(pool, 3, 'a')).not.toContain('a')
    }
  })

  it('all returned items come from the pool', () => {
    const result = pickRandom(pool, 4)
    for (const item of result) {
      expect(pool).toContain(item)
    }
  })

  it('returns no duplicates', () => {
    const result = pickRandom(pool, 4)
    expect(new Set(result).size).toBe(result.length)
  })
})
