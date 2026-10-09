import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_MODULES_API_URL as string | undefined

// Reads one value out of the config Lambda's GET response. `parse` returns null
// when the response doesn't contain a usable value (e.g. a Lambda 500 with an error body).
type Parse<T> = (data: unknown) => T | null

async function parseResponse<T>(res: Response | undefined, parse: Parse<T>): Promise<T | null> {
  if (!res?.ok) return null
  const data = await res.json().catch(() => null)
  return data === null ? null : parse(data)
}

// Last known config, cached by the service worker's NetworkFirst route.
function readCached<T>(url: string, parse: Parse<T>): Promise<T | null> {
  if (!('caches' in window)) return Promise.resolve(null)
  return caches.match(url).then(res => parseResponse(res, parse)).catch(() => null)
}

/**
 * A value from the config Lambda. Returns null while loading; `fallback` if the
 * network fails and nothing has been cached, or if no API is configured
 * (e.g. tests without an env).
 */
export function useApiConfig<T>(parse: Parse<T>, fallback: T): T | null {
  const [value, setValue] = useState<T | null>(API_URL ? null : fallback)

  useEffect(() => {
    if (!API_URL) return

    let cancelled = false
    let networkSettled = false

    // Show the cached config straight away, unless the network already answered.
    readCached(API_URL, parse).then(cached => {
      if (!cancelled && !networkSettled && cached !== null) setValue(cached)
    })

    fetch(API_URL)
      .then(res => parseResponse(res, parse))
      .catch(() => null)
      .then(async fresh => {
        networkSettled = true
        if (cancelled) return
        if (fresh !== null) {
          setValue(fresh)
          return
        }
        // Network failed or returned bad data: prefer the last known config,
        // and only use the fallback if we have never had one.
        const cached = await readCached(API_URL, parse)
        if (!cancelled) setValue(cached ?? fallback)
      })

    return () => { cancelled = true }
    // parse and fallback are module-level constants in every caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return value
}
