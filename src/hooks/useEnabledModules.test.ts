import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MODULES } from '../data/modules'

vi.stubEnv('VITE_MODULES_API_URL', 'https://example.test/modules')
const { useEnabledModules } = await import('./useEnabledModules')

const ALL = MODULES.map(m => m.id)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let cached: Response | undefined
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  cached = undefined
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('caches', { match: vi.fn(async () => cached?.clone()) })
})

afterEach(() => vi.unstubAllGlobals())

describe('useEnabledModules', () => {
  it('uses the network response when it is valid', async () => {
    fetchMock.mockResolvedValue(json({ enabledModules: ['bread'] }))
    const { result } = renderHook(() => useEnabledModules())
    await waitFor(() => expect(result.current).toEqual(['bread']))
  })

  it('falls back to the cached config when the server errors', async () => {
    cached = json({ enabledModules: ['coffee'] })
    fetchMock.mockResolvedValue(json({ error: 'Internal error' }, 500))
    const { result } = renderHook(() => useEnabledModules())
    await waitFor(() => expect(result.current).toEqual(['coffee']))
  })

  it('falls back to the cached config when the response is malformed', async () => {
    cached = json({ enabledModules: ['coffee'] })
    fetchMock.mockResolvedValue(json({ enabledModules: 'nope' }))
    const { result } = renderHook(() => useEnabledModules())
    await waitFor(() => expect(result.current).toEqual(['coffee']))
  })

  it('shows all modules when the network fails and nothing is cached', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const { result } = renderHook(() => useEnabledModules())
    await waitFor(() => expect(result.current).toEqual(ALL))
  })

  it('does not let a slow cache read overwrite a fresh network result', async () => {
    let resolveCache!: (r: Response) => void
    vi.stubGlobal('caches', { match: () => new Promise<Response>(r => { resolveCache = r }) })
    fetchMock.mockResolvedValue(json({ enabledModules: ['bread'] }))
    const { result } = renderHook(() => useEnabledModules())
    await waitFor(() => expect(result.current).toEqual(['bread']))
    resolveCache(json({ enabledModules: ['stale'] }))
    await new Promise(r => setTimeout(r, 10))
    expect(result.current).toEqual(['bread'])
  })
})
