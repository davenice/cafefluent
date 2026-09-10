import { useEffect, useState } from 'react'
import { MODULES } from '../data/modules'

// null = still loading; string[] = response received (may be empty)
const API_URL = import.meta.env.VITE_MODULES_API_URL as string | undefined
const ALL_MODULES = MODULES.map(m => m.id)

// Returns the module list from a response, or null if the response is missing,
// not OK, or not the expected shape (e.g. a Lambda 500 with an error body).
async function parseModules(res: Response | undefined): Promise<string[] | null> {
  if (!res?.ok) return null
  const data = await res.json().catch(() => null)
  return Array.isArray(data?.enabledModules) ? data.enabledModules : null
}

// Last known config, cached by the service worker's NetworkFirst route.
function readCached(url: string): Promise<string[] | null> {
  if (!('caches' in window)) return Promise.resolve(null)
  return caches.match(url).then(parseModules).catch(() => null)
}

export function useEnabledModules(): string[] | null {
  // With no API configured (e.g. tests without an env), every module is enabled.
  const [enabled, setEnabled] = useState<string[] | null>(API_URL ? null : ALL_MODULES)

  useEffect(() => {
    if (!API_URL) return

    let cancelled = false
    let networkSettled = false

    // Show the cached config straight away, unless the network already answered.
    readCached(API_URL).then(list => {
      if (!cancelled && !networkSettled && list) setEnabled(list)
    })

    fetch(API_URL)
      .then(parseModules)
      .catch(() => null)
      .then(async list => {
        networkSettled = true
        if (cancelled) return
        if (list) {
          setEnabled(list)
          return
        }
        // Network failed or returned bad data: prefer the last known config,
        // and only fall back to showing everything if we have never had one.
        const cached = await readCached(API_URL)
        if (!cancelled) setEnabled(cached ?? ALL_MODULES)
      })

    return () => { cancelled = true }
  }, [])

  return enabled
}
