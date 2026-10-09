import { useApiConfig } from '../hooks/useApiConfig'

/** Set by the course leader on the admin page; stored by the config Lambda. */
export interface GameSettings {
  words: string[]
  /** Length of one turn. */
  seconds: number
  /** Turns per game, shared out between the players in order. */
  turns: number
}

export const DEFAULT_GAME_SETTINGS: GameSettings = { words: [], seconds: 60, turns: 8 }

export const SECONDS_RANGE = { min: 10, max: 300 }
export const TURNS_RANGE = { min: 1, max: 50 }

function clampInt(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(range.max, Math.max(range.min, Math.round(value)))
}

/** Tidies settings from the server or the admin form: trims words, drops blanks and repeats. */
export function normaliseGameSettings(raw: unknown): GameSettings {
  const g = (raw ?? {}) as Partial<Record<keyof GameSettings, unknown>>
  const words = Array.isArray(g.words)
    ? [...new Set(g.words.filter((w): w is string => typeof w === 'string').map(w => w.trim()).filter(Boolean))]
    : []
  return {
    words,
    seconds: clampInt(g.seconds, SECONDS_RANGE, DEFAULT_GAME_SETTINGS.seconds),
    turns: clampInt(g.turns, TURNS_RANGE, DEFAULT_GAME_SETTINGS.turns),
  }
}

// A response without `game` (nothing saved yet) still counts as a valid answer.
function parseGame(data: unknown): GameSettings | null {
  if (typeof data !== 'object' || data === null || !('enabledModules' in data)) return null
  return normaliseGameSettings((data as { game?: unknown }).game)
}

/** null while loading. */
export function useGameSettings(): GameSettings | null {
  return useApiConfig(parseGame, DEFAULT_GAME_SETTINGS)
}
