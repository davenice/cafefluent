import { shuffle } from '../utils/shuffle'

/** One word shown to the describer, and whether the table guessed it. */
export interface WordResult {
  word: string
  guessed: boolean
}

export interface TurnRecord {
  player: string
  results: WordResult[]
  /** Less than the full turn only when the words ran out part way through. */
  secondsUsed: number
}

/**
 * - handover: pass the phone to the next player, who taps Start
 * - playing: the timer is running
 * - time-up: the timer has ended; the describer says if the last word was guessed
 * - finished: scores and word lists
 */
export type Phase = 'handover' | 'playing' | 'time-up' | 'finished'

export interface GameState {
  players: string[]
  words: string[]
  seconds: number
  turns: number
  /** Words still to come, current word first. */
  deck: string[]
  phase: Phase
  /** Epoch ms. Set while playing, so a reloaded page carries on with the right time. */
  turnEndsAt: number | null
  /** Completed turns, then the turn in progress (if any). */
  history: TurnRecord[]
}

export function newGame(players: string[], words: string[], seconds: number, turns: number): GameState {
  return { players, words, seconds, turns, deck: shuffle(words), phase: 'handover', turnEndsAt: null, history: [] }
}

/** Index of the turn being played, or about to be played. */
export function turnIndex(state: GameState): number {
  return state.phase === 'handover' ? state.history.length : state.history.length - 1
}

export function currentPlayer(state: GameState): string {
  return state.players[turnIndex(state) % state.players.length]
}

export function currentWord(state: GameState): string | undefined {
  return state.deck[0]
}

/** The player's 1-based turn number, e.g. "Amira's 2nd turn". */
export function playerTurnNumber(state: GameState): number {
  return Math.floor(turnIndex(state) / state.players.length) + 1
}

export function startTurn(state: GameState, now: number): GameState {
  if (state.phase !== 'handover') return state
  return {
    ...state,
    phase: 'playing',
    turnEndsAt: now + state.seconds * 1000,
    history: [...state.history, { player: currentPlayer(state), results: [], secondsUsed: state.seconds }],
  }
}

function guessedWords(history: TurnRecord[]): Set<string> {
  return new Set(history.flatMap(t => t.results.filter(r => r.guessed).map(r => r.word)))
}

/**
 * When the deck is empty, skipped words come round again. The word just
 * skipped is kept off the top so it doesn't show twice in a row.
 */
function refill(state: GameState, lastWord: string): string[] {
  const guessed = guessedWords(state.history)
  const deck = shuffle(state.words.filter(w => !guessed.has(w)))
  if (deck.length > 1 && deck[0] === lastWord) deck.push(deck.shift()!)
  return deck
}

/** Records the current word as guessed or skipped, and moves to the next word. */
export function answer(state: GameState, guessed: boolean, now: number): GameState {
  const word = currentWord(state)
  if ((state.phase !== 'playing' && state.phase !== 'time-up') || word === undefined) return state

  const turns = state.history.slice(0, -1)
  const turn = state.history[state.history.length - 1]
  const history = [...turns, { ...turn, results: [...turn.results, { word, guessed }] }]
  let next: GameState = { ...state, history, deck: state.deck.slice(1) }
  if (next.deck.length === 0) next = { ...next, deck: refill(next, word) }

  if (state.phase === 'time-up') return endTurn(next)

  // Every word has been guessed: stop the turn early and only count the time used.
  if (next.deck.length === 0) {
    const secondsLeft = Math.max(0, (state.turnEndsAt! - now) / 1000)
    const secondsUsed = Math.min(state.seconds, Math.max(1, state.seconds - secondsLeft))
    next.history[next.history.length - 1] = { ...next.history[next.history.length - 1], secondsUsed }
    return { ...next, phase: 'finished', turnEndsAt: null }
  }
  return next
}

/** Takes back the last answer in this turn, putting that word back on top. */
export function undo(state: GameState): GameState {
  if (state.phase !== 'playing' && state.phase !== 'time-up') return state
  const turn = state.history[state.history.length - 1]
  const last = turn.results[turn.results.length - 1]
  if (!last) return state
  const history = [...state.history.slice(0, -1), { ...turn, results: turn.results.slice(0, -1) }]
  return { ...state, history, deck: [last.word, ...state.deck.filter(w => w !== last.word)] }
}

export function timeUp(state: GameState): GameState {
  if (state.phase !== 'playing') return state
  return { ...state, phase: 'time-up', turnEndsAt: null }
}

function endTurn(state: GameState): GameState {
  const finished = state.history.length >= state.turns || state.deck.length === 0
  return { ...state, phase: finished ? 'finished' : 'handover', turnEndsAt: null }
}

/** The course leader can call time on the game between turns. */
export function endGame(state: GameState): GameState {
  return { ...state, phase: 'finished', turnEndsAt: null }
}

export interface GameSummary {
  /** Words guessed per full-length turn. Fair across tables of different sizes. */
  wordsPerTurn: number
  totalGuessed: number
  turnsPlayed: number
  /** Words guessed while each player was describing, in playing order. */
  byPlayer: { player: string; guessed: number }[]
  guessed: string[]
  /** Skipped and never guessed later. */
  skipped: string[]
}

export function summarise(state: GameState): GameSummary {
  const guessedSet = guessedWords(state.history)
  const results = state.history.flatMap(t => t.results)
  const totalGuessed = results.filter(r => r.guessed).length
  const fullTurns = state.history.reduce((sum, t) => sum + t.secondsUsed / state.seconds, 0)
  return {
    wordsPerTurn: fullTurns > 0 ? totalGuessed / fullTurns : 0,
    totalGuessed,
    turnsPlayed: state.history.length,
    byPlayer: state.players.map(player => ({
      player,
      guessed: state.history
        .filter(t => t.player === player)
        .reduce((sum, t) => sum + t.results.filter(r => r.guessed).length, 0),
    })),
    guessed: results.filter(r => r.guessed).map(r => r.word),
    skipped: [...new Set(results.filter(r => !r.guessed && !guessedSet.has(r.word)).map(r => r.word))],
  }
}
