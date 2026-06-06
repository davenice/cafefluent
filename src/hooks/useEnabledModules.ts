import { useEffect, useState } from 'react'
import { MODULES } from '../data/modules'

// null = still loading; string[] = response received (may be empty)
const API_URL = import.meta.env.VITE_MODULES_API_URL as string | undefined
const ALL_MODULES = MODULES.map(m => m.id)

export function useEnabledModules(): string[] | null {
  const [enabled, setEnabled] = useState<string[] | null>(null)

  useEffect(() => {
    if (!API_URL) {
      setEnabled(ALL_MODULES)
      return
    }

    const apply = (data: { enabledModules: string[] }) => setEnabled(data.enabledModules)

    if ('caches' in window) {
      caches.match(API_URL)
        .then(r => r?.json())
        .then(data => { if (data?.enabledModules) apply(data) })
        .catch(() => {})
    }

    fetch(API_URL)
      .then(r => r.json())
      .then(apply)
      .catch(() => setEnabled(ALL_MODULES))
  }, [])

  return enabled
}
