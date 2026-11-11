import { MODULES, DESCRIBE_GAME, MIXED_QUIZ } from '../data/modules'
import { useApiConfig } from './useApiConfig'

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
