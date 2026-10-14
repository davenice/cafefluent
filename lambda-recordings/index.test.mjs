// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// An in-memory bucket behind the S3 client the handler creates. `listing.pageSize`
// is small so paging through a listing gets tested.
const { objects, listing } = vi.hoisted(() => ({ objects: new Map(), listing: { pageSize: 1000 } }))

vi.mock('@aws-sdk/client-s3', () => {
  class GetObjectCommand { constructor(input) { this.input = input } }
  class PutObjectCommand { constructor(input) { this.input = input } }
  class ListObjectsV2Command { constructor(input) { this.input = input } }
  class S3Client {
    async send(command) {
      const { Key, Body, Prefix, ContinuationToken } = command.input
      if (command instanceof PutObjectCommand) {
        objects.set(Key, Buffer.isBuffer(Body) ? Body : Buffer.from(Body))
        return {}
      }
      if (command instanceof GetObjectCommand) {
        if (!objects.has(Key)) throw Object.assign(new Error(`${Key} not found`), { name: 'NoSuchKey' })
        const bytes = objects.get(Key)
        return { Body: { transformToString: async () => bytes.toString('utf8') } }
      }
      const keys = [...objects.keys()].filter(k => k.startsWith(Prefix)).sort()
      const start = ContinuationToken ? Number(ContinuationToken) : 0
      const end = start + listing.pageSize
      return {
        Contents: keys.slice(start, end).map(Key => ({ Key })),
        IsTruncated: end < keys.length,
        NextContinuationToken: end < keys.length ? String(end) : undefined,
      }
    }
  }
  return { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command }
})

const { handler } = await import('./index.mjs')

const PIN = '246810'

function request(method, path, { body, pin, token, base64 } = {}) {
  return handler({
    rawPath: path,
    requestContext: { http: { method } },
    headers: {
      origin: 'https://cafefluent.dandr.org',
      ...(pin === undefined ? {} : { 'x-admin-pin': pin }),
      ...(token === undefined ? {} : { 'x-contributor-token': token }),
    },
    ...(base64 !== undefined
      ? { body: base64.toString('base64'), isBase64Encoded: true }
      : body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const json = res => JSON.parse(res.body)

function wav(dataBytes = 1000) {
  const bytes = Buffer.alloc(44 + dataBytes)
  bytes.write('RIFF', 0, 'ascii')
  bytes.write('WAVE', 8, 'ascii')
  return bytes
}

async function addContributor(name = 'Amira Haddad') {
  return json(await request('POST', '/contributors', { pin: PIN, body: { name } })).contributor
}

async function consentingContributor() {
  const c = await addContributor()
  await request('POST', '/me/consent', { token: c.token })
  return c
}

beforeEach(() => {
  objects.clear()
  listing.pageSize = 1000
  vi.stubEnv('ADMIN_PIN', PIN)
  vi.stubEnv('BUCKET', 'cafefluent-recordings')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('CORS', () => {
  it('answers a preflight without needing a PIN or token', async () => {
    const res = await request('OPTIONS', '/clips/allergens/milk_name.wav')
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Headers']).toContain('x-contributor-token')
    expect(res.headers['Access-Control-Allow-Methods']).toContain('PUT')
  })
})

describe('admin', () => {
  it('rejects a wrong PIN after a delay, and adds no one', async () => {
    vi.useFakeTimers()
    const pending = request('POST', '/contributors', { pin: '000000', body: { name: 'Amira' } })
    await vi.advanceTimersByTimeAsync(2000)
    expect((await pending).statusCode).toBe(401)
    expect(objects.has('contributors.json')).toBe(false)
  })

  it('rejects every request if no PIN is configured', async () => {
    vi.stubEnv('ADMIN_PIN', '')
    vi.useFakeTimers()
    const pending = request('GET', '/contributors', { pin: '' })
    await vi.advanceTimersByTimeAsync(2000)
    expect((await pending).statusCode).toBe(401)
  })

  it('lists no one before anyone is added', async () => {
    const res = await request('GET', '/contributors', { pin: PIN })
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ contributors: [] })
  })

  it('adds a contributor with an id from their name and an unguessable token', async () => {
    const res = await request('POST', '/contributors', { pin: PIN, body: { name: '  Amira Haddad ' } })
    expect(res.statusCode).toBe(201)
    const { contributor } = json(res)
    expect(contributor.name).toBe('Amira Haddad')
    expect(contributor.id).toMatch(/^amira-haddad-[0-9a-f]{6}$/)
    expect(contributor.token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(contributor.revoked).toBe(false)
  })

  it('gives a name with no letters or digits a generic id', async () => {
    expect((await addContributor('محمد')).id).toMatch(/^contributor-[0-9a-f]{6}$/)
  })

  it('gives two people with the same name different ids and tokens', async () => {
    const a = await addContributor('Sam')
    const b = await addContributor('Sam')
    expect(a.id).not.toBe(b.id)
    expect(a.token).not.toBe(b.token)
  })

  it.each([
    ['missing', {}],
    ['blank', { name: '   ' }],
    ['not a string', { name: 7 }],
    ['too long', { name: 'x'.repeat(61) }],
  ])('rejects a name that is %s', async (_, body) => {
    const res = await request('POST', '/contributors', { pin: PIN, body })
    expect(res.statusCode).toBe(400)
    expect(objects.has('contributors.json')).toBe(false)
  })

  it('lists contributors with their consent and clip counts', async () => {
    listing.pageSize = 2
    const amira = await consentingContributor()
    const sam = await addContributor('Sam')
    for (const file of ['milk_name.wav', 'milk_allergic.wav', 'eggs_name.wav']) {
      await request('PUT', `/clips/allergens/${file}`, { token: amira.token, base64: wav() })
    }

    const { contributors } = json(await request('GET', '/contributors', { pin: PIN }))
    expect(contributors).toEqual([
      { ...amira, consented: true, clips: 3 },
      { ...sam, consented: false, clips: 0 },
    ])
  })

  it('revokes a contributor, keeping their clips', async () => {
    const c = await consentingContributor()
    await request('PUT', '/clips/allergens/milk_name.wav', { token: c.token, base64: wav() })

    const res = await request('DELETE', `/contributors/${c.id}`, { pin: PIN })
    expect(res.statusCode).toBe(200)

    expect((await request('GET', '/me', { token: c.token })).statusCode).toBe(401)
    const { contributors } = json(await request('GET', '/contributors', { pin: PIN }))
    expect(contributors[0]).toMatchObject({ id: c.id, revoked: true, clips: 1 })
  })

  it('returns 404 when revoking someone who does not exist', async () => {
    const res = await request('DELETE', '/contributors/nobody-000000', { pin: PIN })
    expect(res.statusCode).toBe(404)
  })

  it('returns 500 for a body that is not JSON', async () => {
    const res = await handler({
      rawPath: '/contributors',
      requestContext: { http: { method: 'POST' } },
      headers: { 'x-admin-pin': PIN },
      body: '{',
    })
    expect(res.statusCode).toBe(500)
  })
})

describe('contributor', () => {
  it.each([
    ['no token', undefined],
    ['an unknown token', 'not-a-real-token'],
  ])('rejects %s', async (_, token) => {
    await addContributor()
    expect((await request('GET', '/me', { token })).statusCode).toBe(401)
    expect((await request('PUT', '/clips/allergens/milk_name.wav', { token, base64: wav() })).statusCode).toBe(401)
  })

  it('tells a new contributor who they are, that they have not agreed yet, and that nothing is recorded', async () => {
    const c = await addContributor()
    const res = await request('GET', '/me', { token: c.token })
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ id: c.id, name: 'Amira Haddad', consented: false, clips: [] })
  })

  it('does not give the token or other contributors away', async () => {
    await addContributor('Sam')
    const c = await addContributor()
    const body = (await request('GET', '/me', { token: c.token })).body
    expect(body).not.toContain(c.token)
    expect(body).not.toContain('Sam')
  })

  it('records consent', async () => {
    const c = await addContributor()
    const res = await request('POST', '/me/consent', { token: c.token })
    expect(res.statusCode).toBe(200)
    expect(json(await request('GET', '/me', { token: c.token })).consented).toBe(true)
    expect(JSON.parse(objects.get(`consent/${c.id}.json`))).toMatchObject({ id: c.id, name: 'Amira Haddad' })
  })

  it('refuses clips until the contributor has agreed', async () => {
    const c = await addContributor()
    const res = await request('PUT', '/clips/allergens/milk_name.wav', { token: c.token, base64: wav() })
    expect(res.statusCode).toBe(403)
    expect([...objects.keys()].some(k => k.startsWith('clips/'))).toBe(false)
  })

  it('saves a clip under the contributor and lists it', async () => {
    const c = await consentingContributor()
    const clip = wav()
    const res = await request('PUT', '/clips/allergens/milk_must-not-eat.wav', { token: c.token, base64: clip })
    expect(res.statusCode).toBe(200)
    expect(objects.get(`clips/${c.id}/allergens/milk_must-not-eat.wav`).equals(clip)).toBe(true)
    expect(json(await request('GET', '/me', { token: c.token })).clips).toEqual([
      { module: 'allergens', file: 'milk_must-not-eat.wav' },
    ])
  })

  it('replaces a clip recorded again', async () => {
    const c = await consentingContributor()
    await request('PUT', '/clips/allergens/milk_name.wav', { token: c.token, base64: wav(100) })
    await request('PUT', '/clips/allergens/milk_name.wav', { token: c.token, base64: wav(200) })
    expect(objects.get(`clips/${c.id}/allergens/milk_name.wav`).length).toBe(244)
    expect(json(await request('GET', '/me', { token: c.token })).clips).toHaveLength(1)
  })

  it('only lists their own clips', async () => {
    const a = await consentingContributor()
    const b = await consentingContributor()
    await request('PUT', '/clips/allergens/milk_name.wav', { token: a.token, base64: wav() })
    expect(json(await request('GET', '/me', { token: b.token })).clips).toEqual([])
  })

  it.each([
    ['a path in the module', '/clips/..%2Fother/milk_name.wav'],
    ['capitals in the module', '/clips/Allergens/milk_name.wav'],
    ['a file without a variant', '/clips/allergens/milk.wav'],
    ['a file that is not .wav', '/clips/allergens/milk_name.mp3'],
    ['a file with a path', '/clips/allergens/..%2Fmilk_name.wav'],
  ])('rejects %s', async (_, path) => {
    const c = await consentingContributor()
    const res = await request('PUT', path, { token: c.token, base64: wav() })
    expect(res.statusCode).toBe(400)
    expect([...objects.keys()].some(k => k.startsWith('clips/'))).toBe(false)
  })

  it('returns 404 for a path with too many parts', async () => {
    const c = await consentingContributor()
    const res = await request('PUT', '/clips/allergens/x/milk_name.wav', { token: c.token, base64: wav() })
    expect(res.statusCode).toBe(404)
  })

  it('rejects a body that is not a WAV', async () => {
    const c = await consentingContributor()
    const res = await request('PUT', '/clips/allergens/milk_name.wav', { token: c.token, base64: Buffer.from('ID3'.padEnd(100)) })
    expect(res.statusCode).toBe(400)
  })

  it('rejects an empty body', async () => {
    const c = await consentingContributor()
    const res = await request('PUT', '/clips/allergens/milk_name.wav', { token: c.token })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a clip over 2 MB', async () => {
    const c = await consentingContributor()
    const res = await request('PUT', '/clips/allergens/milk_name.wav', { token: c.token, base64: wav(2 * 1024 * 1024) })
    expect(res.statusCode).toBe(413)
  })
})

describe('logging', () => {
  it('logs the route and contributor, never the token', async () => {
    const c = await consentingContributor()
    console.log.mockClear()
    await request('PUT', '/clips/allergens/milk_name.wav', { token: c.token, base64: wav() })
    const line = console.log.mock.calls.at(-1)[0]
    expect(JSON.parse(line)).toEqual({
      event: 'request', method: 'PUT', route: 'PUT /clips/:module/:file', status: 200, contributor: c.id,
    })
    expect(line).not.toContain(c.token)
  })
})

it('returns 404 for an unknown path', async () => {
  expect((await request('GET', '/nothing')).statusCode).toBe(404)
})
