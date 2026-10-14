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
const ADMIN_KEY = 'test-admin-key'
const LEGACY_PIN = '246810'
const GAME_SETTINGS = { words: ['latte', 'scone'], seconds: 45, turns: 6 }

function request(method, { body, key, legacyPin, origin = 'https://cafefluent.dandr.org' } = {}) {
  return handler({
    requestContext: { http: { method, sourceIp: '203.0.113.7', userAgent: 'iPhone' } },
    headers: {
      origin,
      ...(key === undefined ? {} : { 'x-admin-key': key }),
      ...(legacyPin === undefined ? {} : { 'x-admin-pin': legacyPin }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// A wrong secret is answered after a 2 second delay, so these have to be driven
// with fake timers rather than waited on.
async function rejected(pending) {
  await vi.advanceTimersByTimeAsync(2000)
  return pending
}

const json = res => JSON.parse(res.body)

beforeEach(() => {
  params.clear()
  params.set(MODULES, 'allergens, bread,,')
  vi.stubEnv('ADMIN_KEY', ADMIN_KEY)
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
  it('rejects a wrong key after a delay, and saves nothing', async () => {
    vi.useFakeTimers()
    const res = await rejected(request('POST', { key: 'wrong', body: { enabledModules: [] } }))

    expect(res.statusCode).toBe(401)
    expect(params.get(MODULES)).toBe('allergens, bread,,')
  })

  it('rejects a missing key', async () => {
    vi.useFakeTimers()
    expect((await rejected(request('POST', { body: {} }))).statusCode).toBe(401)
  })

  // The old six-digit PIN stays valid for one release, under either name, so the
  // function and the site can be deployed minutes apart.
  it('accepts the key under the old header name', async () => {
    const res = await request('POST', { legacyPin: ADMIN_KEY, body: {} })
    expect(res.statusCode).toBe(200)
  })

  it('accepts a secret still configured as ADMIN_PIN', async () => {
    vi.stubEnv('ADMIN_KEY', '')
    vi.stubEnv('ADMIN_PIN', LEGACY_PIN)
    expect((await request('POST', { key: LEGACY_PIN, body: {} })).statusCode).toBe(200)
    expect((await request('POST', { legacyPin: LEGACY_PIN, body: {} })).statusCode).toBe(200)
  })

  // Comparing a missing header against a missing variable used to come out equal,
  // which let anyone through whenever the variable was dropped from the function.
  it('refuses everything when no secret is configured', async () => {
    vi.stubEnv('ADMIN_KEY', '')
    vi.stubEnv('ADMIN_PIN', '')
    vi.useFakeTimers()

    for (const options of [{ body: {} }, { key: '', body: {} }, { legacyPin: '', body: {} }]) {
      expect((await rejected(request('POST', options))).statusCode).toBe(401)
    }
    expect(params.get(MODULES)).toBe('allergens, bread,,')
  })

  it('with only the key, returns the current state', async () => {
    params.set(GAME, JSON.stringify(GAME_SETTINGS))
    for (const body of [undefined, {}]) {
      const res = await request('POST', { key: ADMIN_KEY, body })
      expect(res.statusCode).toBe(200)
      expect(json(res)).toEqual({ ok: true, enabledModules: ['allergens', 'bread'], game: GAME_SETTINGS })
    }
  })

  it('saves the enabled modules', async () => {
    const res = await request('POST', { key: ADMIN_KEY, body: { enabledModules: ['coffee-drinks', 'describe-it'] } })
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ ok: true })
    expect(params.get(MODULES)).toBe('coffee-drinks,describe-it')
    expect(params.has(GAME)).toBe(false)
  })

  it('saves an empty module list', async () => {
    await request('POST', { key: ADMIN_KEY, body: { enabledModules: [] } })
    expect(json(await request('GET')).enabledModules).toEqual([])
  })

  it('saves the game settings', async () => {
    const res = await request('POST', { key: ADMIN_KEY, body: { game: GAME_SETTINGS } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(params.get(GAME))).toEqual(GAME_SETTINGS)
    expect(params.get(MODULES)).toBe('allergens, bread,,')
  })

  it('saves both together', async () => {
    await request('POST', { key: ADMIN_KEY, body: { enabledModules: ['bread'], game: GAME_SETTINGS } })
    expect(json(await request('GET'))).toEqual({ enabledModules: ['bread'], game: GAME_SETTINGS })
  })

  it.each([
    ['not an object', 'words'],
    ['words not a list', { words: 'latte', seconds: 45, turns: 6 }],
    ['a word not a string', { words: ['latte', 3], seconds: 45, turns: 6 }],
    ['seconds not a whole number', { words: [], seconds: 4.5, turns: 6 }],
    ['turns missing', { words: [], seconds: 45 }],
  ])('rejects game settings with %s, and saves nothing', async (_, game) => {
    const res = await request('POST', { key: ADMIN_KEY, body: { enabledModules: ['bread'], game } })
    expect(res.statusCode).toBe(400)
    expect(params.get(MODULES)).toBe('allergens, bread,,')
    expect(params.has(GAME)).toBe(false)
  })

  it('returns 500 for a body that is not JSON', async () => {
    const res = await handler({
      requestContext: { http: { method: 'POST' } },
      headers: { 'x-admin-key': ADMIN_KEY },
      body: '{',
    })
    expect(res.statusCode).toBe(500)
  })
})

describe('CORS', () => {
  it('answers a preflight', async () => {
    const res = await request('OPTIONS')
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Headers']).toContain('x-admin-key')
  })

  it('tells caches that the allowed origin varies', async () => {
    expect((await request('GET')).headers.Vary).toBe('Origin')
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
