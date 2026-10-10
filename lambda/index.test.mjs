// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// An in-memory Parameter Store behind the SSM client the handler creates.
const { params } = vi.hoisted(() => ({ params: new Map() }))

vi.mock('@aws-sdk/client-ssm', () => {
  class GetParameterCommand { constructor(input) { this.input = input } }
  class PutParameterCommand { constructor(input) { this.input = input } }
  class SSMClient {
    async send(command) {
      const { Name, Value } = command.input
      if (command instanceof PutParameterCommand) {
        params.set(Name, Value)
        return {}
      }
      if (!params.has(Name)) {
        throw Object.assign(new Error(`${Name} not found`), { name: 'ParameterNotFound' })
      }
      return { Parameter: { Name, Value: params.get(Name) } }
    }
  }
  return { SSMClient, GetParameterCommand, PutParameterCommand }
})

const { handler } = await import('./index.mjs')

const MODULES = '/cafefluent/enabled-modules'
const GAME = '/cafefluent/game-settings'
const PIN = '246810'
const GAME_SETTINGS = { words: ['latte', 'scone'], seconds: 45, turns: 6 }

function request(method, { body, pin, origin = 'https://cafefluent.dandr.org' } = {}) {
  return handler({
    requestContext: { http: { method, sourceIp: '203.0.113.7', userAgent: 'iPhone' } },
    headers: { origin, ...(pin === undefined ? {} : { 'x-admin-pin': pin }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const json = res => JSON.parse(res.body)

beforeEach(() => {
  params.clear()
  params.set(MODULES, 'allergens, bread,,')
  vi.stubEnv('ADMIN_PIN', PIN)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET', () => {
  it('returns the enabled modules, trimmed, and null game settings before any are saved', async () => {
    const res = await request('GET')
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ enabledModules: ['allergens', 'bread'], game: null })
  })

  it('returns saved game settings', async () => {
    params.set(GAME, JSON.stringify(GAME_SETTINGS))
    expect(json(await request('GET')).game).toEqual(GAME_SETTINGS)
  })

  it('still returns the modules if the game settings are unreadable', async () => {
    params.set(GAME, 'not json')
    const res = await request('GET')
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ enabledModules: ['allergens', 'bread'], game: null })
  })

  it('returns 500 if the module list is missing', async () => {
    params.delete(MODULES)
    const res = await request('GET')
    expect(res.statusCode).toBe(500)
    expect(json(res)).toEqual({ error: 'Internal error' })
  })
})

describe('POST', () => {
  it('rejects a wrong PIN after a delay, and saves nothing', async () => {
    vi.useFakeTimers()
    const pending = request('POST', { pin: '000000', body: { enabledModules: [] } })
    await vi.advanceTimersByTimeAsync(2000)
    const res = await pending

    expect(res.statusCode).toBe(401)
    expect(params.get(MODULES)).toBe('allergens, bread,,')
  })

  it('rejects a missing PIN', async () => {
    vi.useFakeTimers()
    const pending = request('POST', { body: {} })
    await vi.advanceTimersByTimeAsync(2000)
    expect((await pending).statusCode).toBe(401)
  })

  it('with only the PIN, returns the current state', async () => {
    params.set(GAME, JSON.stringify(GAME_SETTINGS))
    for (const body of [undefined, {}]) {
      const res = await request('POST', { pin: PIN, body })
      expect(res.statusCode).toBe(200)
      expect(json(res)).toEqual({ ok: true, enabledModules: ['allergens', 'bread'], game: GAME_SETTINGS })
    }
  })

  it('saves the enabled modules', async () => {
    const res = await request('POST', { pin: PIN, body: { enabledModules: ['coffee-drinks', 'describe-it'] } })
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ ok: true })
    expect(params.get(MODULES)).toBe('coffee-drinks,describe-it')
    expect(params.has(GAME)).toBe(false)
  })

  it('saves an empty module list', async () => {
    await request('POST', { pin: PIN, body: { enabledModules: [] } })
    expect(json(await request('GET')).enabledModules).toEqual([])
  })

  it('saves the game settings', async () => {
    const res = await request('POST', { pin: PIN, body: { game: GAME_SETTINGS } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(params.get(GAME))).toEqual(GAME_SETTINGS)
    expect(params.get(MODULES)).toBe('allergens, bread,,')
  })

  it('saves both together', async () => {
    await request('POST', { pin: PIN, body: { enabledModules: ['bread'], game: GAME_SETTINGS } })
    expect(json(await request('GET'))).toEqual({ enabledModules: ['bread'], game: GAME_SETTINGS })
  })

  it.each([
    ['not an object', 'words'],
    ['words not a list', { words: 'latte', seconds: 45, turns: 6 }],
    ['a word not a string', { words: ['latte', 3], seconds: 45, turns: 6 }],
    ['seconds not a whole number', { words: [], seconds: 4.5, turns: 6 }],
    ['turns missing', { words: [], seconds: 45 }],
  ])('rejects game settings with %s, and saves nothing', async (_, game) => {
    const res = await request('POST', { pin: PIN, body: { enabledModules: ['bread'], game } })
    expect(res.statusCode).toBe(400)
    expect(params.get(MODULES)).toBe('allergens, bread,,')
    expect(params.has(GAME)).toBe(false)
  })

  it('returns 500 for a body that is not JSON', async () => {
    const res = await handler({
      requestContext: { http: { method: 'POST' } },
      headers: { 'x-admin-pin': PIN },
      body: '{',
    })
    expect(res.statusCode).toBe(500)
  })
})

describe('CORS', () => {
  it('answers a preflight', async () => {
    const res = await request('OPTIONS')
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Headers']).toContain('x-admin-pin')
  })

  it('echoes an allowed origin', async () => {
    const res = await request('GET', { origin: 'http://localhost:5173' })
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
  })

  it('answers other origins with the production site', async () => {
    const res = await request('GET', { origin: 'https://example.com' })
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://cafefluent.dandr.org')
  })
})

describe('logging', () => {
  it('logs one line per request without the raw IP', async () => {
    vi.stubEnv('LOG_HMAC_KEY', 'test-key')
    await request('GET')

    expect(console.log).toHaveBeenCalledTimes(1)
    const line = console.log.mock.calls[0][0]
    expect(JSON.parse(line)).toMatchObject({ event: 'request', method: 'GET', status: 200, ua: 'ios' })
    expect(JSON.parse(line).client).toMatch(/^[0-9a-f]{12}$/)
    expect(line).not.toContain('203.0.113.7')
  })
})
