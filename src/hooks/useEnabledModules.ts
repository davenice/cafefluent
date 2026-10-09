import { MODULES, DESCRIBE_GAME } from '../data/modules'
import { useApiConfig } from './useApiConfig'

const ALL_MODULES = [...MODULES.map(m => m.id), DESCRIBE_GAME.id]

function parseModules(data: unknown): string[] | null {
  const list = (data as { enabledModules?: unknown }).enabledModules
  return Array.isArray(list) ? list : null
}

// null = still loading; string[] = response received (may be empty).
// Covers the table games as well as the modules.
export function useEnabledModules(): string[] | null {
  return useApiConfig(parseModules, ALL_MODULES)
}
