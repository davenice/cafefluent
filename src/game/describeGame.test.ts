import { describe, expect, it } from 'vitest'
import {
  answer, currentPlayer, currentWord, endGame, newGame, startTurn, summarise, timeUp, undo, type GameState,
} from './describeGame'
import { normaliseGameSettings } from './settings'

const WORDS = ['kettle', 'whisk', 'tongs', 'ladle', 'sieve', 'grater']
const T0 = 1_000_000

function game(players = ['Amira', 'Ben', 'Chen'], words = WORDS, seconds = 60, turns = 4): GameState {
  return newGame(players, words, seconds, turns)
}

const got = (g: GameState) => answer(g, true, T0)
const skip = (g: GameState) => answer(g, false, T0)

describe('describe game', () => {
  it('shares turns out between the players in order', () => {
    let g = game()
    const order: string[] = []
    for (let i = 0; i < 4; i++) {
      order.push(currentPlayer(g))
      g = got(timeUp(startTurn(g, T0)))
    }
    expect(order).toEqual(['Amira', 'Ben', 'Chen', 'Amira'])
    expect(g.phase).toBe('finished')
  })

  it('asks about the last word when time runs out, then hands over', () => {
    let g = timeUp(got(startTurn(game(), T0)))
    expect(g.phase).toBe('time-up')
    g = skip(g)
    expect(g.phase).toBe('handover')
    expect(currentPlayer(g)).toBe('Ben')
    expect(g.history[0].results.map(r => r.guessed)).toEqual([true, false])
  })

  it('undo puts the last word back on top', () => {
    let g = startTurn(game(), T0)
    const first = currentWord(g)
    g = undo(skip(g))
    expect(currentWord(g)).toBe(first)
    expect(g.history[0].results).toEqual([])
  })

  it('brings skipped words back when the deck runs out, but never guessed ones', () => {
    let g = startTurn(game(['A', 'B'], ['tea', 'milk']), T0)
    const guessed = currentWord(g)!
    g = got(g)
    const skipped = currentWord(g)!
    g = skip(g)
    expect(g.deck).toEqual([skipped])
    expect(g.deck).not.toContain(guessed)
  })

  it('ends the game early when every word is guessed, counting only the time used', () => {
    let g = startTurn(game(['A', 'B'], ['tea', 'milk'], 60, 4), T0)
    g = answer(g, true, T0 + 10_000)
    g = answer(g, true, T0 + 30_000)
    expect(g.phase).toBe('finished')
    expect(g.history[0].secondsUsed).toBe(30)
    // 2 words in half a turn = 4 words per full turn
    expect(summarise(g).wordsPerTurn).toBe(4)
  })

  it('scores words per turn, per player, and lists skipped words not later guessed', () => {
    let g = game(['A', 'B'], WORDS, 60, 2)
    g = startTurn(g, T0)
    const w1 = currentWord(g)!; g = got(g)
    const w2 = currentWord(g)!; g = skip(g)
    const w3 = currentWord(g)!; g = got(timeUp(g))
    g = startTurn(g, T0)
    const w4 = currentWord(g)!; g = skip(g)
    g = skip(timeUp(g))

    const s = summarise(g)
    expect(s.turnsPlayed).toBe(2)
    expect(s.totalGuessed).toBe(2)
    expect(s.wordsPerTurn).toBe(1)
    expect(s.byPlayer).toEqual([{ player: 'A', guessed: 2 }, { player: 'B', guessed: 0 }])
    expect(s.guessed).toEqual([w1, w3])
    expect(s.skipped).toContain(w2)
    expect(s.skipped).toContain(w4)
  })

  it('can be ended between turns', () => {
    const g = endGame(skip(timeUp(startTurn(game(), T0))))
    expect(g.phase).toBe('finished')
    expect(summarise(g).turnsPlayed).toBe(1)
  })
})

describe('normaliseGameSettings', () => {
  it('tidies words and keeps numbers in range', () => {
    expect(normaliseGameSettings({ words: [' tea ', '', 'tea', 'milk', 3], seconds: 2, turns: 500 }))
      .toEqual({ words: ['tea', 'milk'], seconds: 10, turns: 50 })
  })

  it('uses defaults when nothing has been saved', () => {
    expect(normaliseGameSettings(null)).toEqual({ words: [], seconds: 60, turns: 8 })
  })
})
