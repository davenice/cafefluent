import { MODULES, DESCRIBE_GAME, MIXED_QUIZ } from '../data/modules'
import { useApiConfig } from './useApiConfig'

// What to show when the config can't be read at all: everything, so a first
// visit on a bad connection doesn't look like a broken app. The final exam is
// deliberately not in here. It is sat once, on a day the course leader picks,
// and showing it to someone whose config simply failed to load would be worse
// than showing them nothing. It appears only when the server names it.
const ALL_MODULES = [...MODULES.map(m => m.id), DESCRIBE_GAME.id, MIXED_QUIZ.id]

function parseModules(data: unknown): string[] | null {
  const list = (data as { enabledModules?: unknown }).enabledModules
  return Array.isArray(list) ? list : null
}

// null = still loading; string[] = response received (may be empty).
// Covers the table games and the mixed quiz as well as the modules.
export function useEnabledModules(): string[] | null {
  return useApiConfig(parseModules, ALL_MODULES)
}
