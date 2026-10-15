// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// An in-memory bucket behind the S3 client the handler creates. `listing.pageSize`
// is small so paging through a listing gets tested. ETags and conditional writes
// are copied from S3 because the handler relies on them to avoid lost updates:
// `state.onContributorsWrite` lets a test slip a write in between the handler's
// read and its own write.
const { objects, etags, listing, state } = vi.hoisted(() => ({
  objects: new Map(),
  etags: new Map(),
  listing: { pageSize: 1000 },
  state: { etag: 0, onContributorsWrite: null },
}))

vi.mock('@aws-sdk/client-s3', () => {
  class GetObjectCommand { constructor(input) { this.input = input } }
  class PutObjectCommand { constructor(input) { this.input = input } }
  class ListObjectsV2Command { constructor(input) { this.input = input } }
  const precondition = () => Object.assign(
    new Error('At least one of the pre-conditions you specified did not hold'),
    { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } },
  )
  class S3Client {
    async send(command) {
      const { Key, Body, Prefix, ContinuationToken, IfMatch, IfNoneMatch } = command.input
      if (command instanceof PutObjectCommand) {
        if (Key === 'contributors.json' && state.onContributorsWrite) {
          const hook = state.onContributorsWrite
          state.onContributorsWrite = null
          hook()
        }
        if (IfMatch !== undefined && etags.get(Key) !== IfMatch) throw precondition()
        if (IfNoneMatch === '*' && objects.has(Key)) throw precondition()
        objects.set(Key, Buffer.isBuffer(Body) ? Body : Buffer.from(Body))
        etags.set(Key, `"${++state.etag}"`)
        return {}
      }
      if (command instanceof GetObjectCommand) {
        if (!objects.has(Key)) throw Object.assign(new Error(`${Key} not found`), { name: 'NoSuchKey' })
        const bytes = objects.get(Key)
        return { Body: { transformToString: async () => bytes.toString('utf8') }, ETag: etags.get(Key) }
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

const CONTRIBUTORS = 'contributors.json'
const ADMIN_KEY = 'test-admin-key-long-enough-to-be-a-password'

function request(method, path, { body, key, token, base64, origin = 'https://cafefluent.dandr.org' } = {}) {
  return handler({
    rawPath: path,
    requestContext: { http: { method } },
    headers: {
      origin,
      ...(key === undefined ? {} : { 'x-admin-key': key }),
      ...(token === undefined ? {} : { 'x-contributor-token': token }),
    },
    ...(base64 !== undefined
      ? { body: base64.toString('base64'), isBase64Encoded: true }
      : body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const json = res => JSON.parse(res.body)

// Writes straight to the bucket, as another writer would.
function store(key, body) {
  objects.set(key, Buffer.from(body))
  etags.set(key, `"${++state.etag}"`)
}

function wav(dataBytes = 1000) {
  const bytes = Buffer.alloc(44 + dataBytes)
  bytes.write('RIFF', 0, 'ascii')
  bytes.write('WAVE', 8, 'ascii')
  return bytes
}

async function addContributor(name = 'Amira Haddad') {
  const { contributor, token } = json(await request('POST', '/contributors', { key: ADMIN_KEY, body: { name } }))
  return { ...contributor, token }
}

async function consentingContributor() {
  const c = await addContributor()
  await request('POST', '/me/consent', { token: c.token })
  return c
}

beforeEach(() => {
  objects.clear()
  etags.clear()
  state.etag = 0
  state.onContributorsWrite = null
  listing.pageSize = 1000
  vi.stubEnv('ADMIN_KEY', ADMIN_KEY)
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
  it('answers a preflight without needing a key or token', async () => {
    const res = await request('OPTIONS', '/clips/allergens/milk_name.wav')
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Headers']).toContain('x-contributor-token')
    expect(res.headers['Access-Control-Allow-Headers']).toContain('x-admin-key')
    expect(res.headers['Access-Control-Allow-Methods']).toContain('PUT')
  })

  it('allows only the live site by default, and tells caches the answer varies', async () => {
    const res = await request('GET', '/me', { origin: 'http://localhost:5173' })
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://cafefluent.dandr.org')
    expect(res.headers.Vary).toBe('Origin')
  })

  it('allows localhost only where ALLOW_LOCALHOST is set', async () => {
    vi.stubEnv('ALLOW_LOCALHOST', 'true')
    const res = await request('GET', '/me', { origin: 'http://localhost:5173' })
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
  })
})

describe('admin', () => {
  it('rejects a wrong key, and adds no one', async () => {
    const res = await request('POST', '/contributors', { key: 'wrong', body: { name: 'Amira' } })
    expect(res.statusCode).toBe(401)
    expect(objects.has(CONTRIBUTORS)).toBe(false)
  })

  it.each([
    ['no key at all', undefined],
    ['an empty key', ''],
  ])('rejects %s', async (_, key) => {
    expect((await request('GET', '/contributors', { key })).statusCode).toBe(401)
  })

  // Comparing a missing header against a missing variable must not come out equal.
  it('rejects every request if no key is configured', async () => {
    vi.stubEnv('ADMIN_KEY', '')
    for (const key of [undefined, '', 'anything']) {
      expect((await request('GET', '/contributors', { key })).statusCode).toBe(401)
    }
  })

  it('lists no one before anyone is added', async () => {
    const res = await request('GET', '/contributors', { key: ADMIN_KEY })
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ contributors: [] })
  })

  it('adds a contributor with an id from their name, and returns the token once', async () => {
    const res = await request('POST', '/contributors', { key: ADMIN_KEY, body: { name: ' Amira Haddad ' } })
    expect(res.statusCode).toBe(201)
    const { contributor, token } = json(res)
    expect(contributor.name).toBe('Amira Haddad')
    expect(contributor.id).toMatch(/^amira-haddad-[0-9a-f]{6}$/)
    expect(contributor.revoked).toBe(false)
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    // The token is not part of the contributor, so listing them cannot leak it.
    expect(contributor.token).toBeUndefined()
  })

  it('stores only a hash of the token, never the token', async () => {
    const c = await addContributor()
    const stored = JSON.parse(objects.get(CONTRIBUTORS))
    expect(stored[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored[0].token).toBeUndefined()
    expect(objects.get(CONTRIBUTORS).toString()).not.toContain(c.token)
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
    ['blank', { name: ' ' }],
    ['not a string', { name: 7 }],
    ['too long', { name: 'x'.repeat(61) }],
  ])('rejects a name that is %s', async (_, body) => {
    const res = await request('POST', '/contributors', { key: ADMIN_KEY, body })
    expect(res.statusCode).toBe(400)
    expect(objects.has(CONTRIBUTORS)).toBe(false)
  })

  it('lists contributors with their consent and clip counts, and no secrets', async () => {
    listing.pageSize = 2
    const amira = await consentingContributor()
    const sam = await addContributor('Sam')
    for (const file of ['milk_name.wav', 'milk_allergic.wav', 'eggs_name.wav']) {
      await request('PUT', `/clips/allergens/${file}`, { token: amira.token, base64: wav() })
    }

    const res = await request('GET', '/contributors', { key: ADMIN_KEY })
    expect(json(res).contributors).toEqual([
      { id: amira.id, name: 'Amira Haddad', created: amira.created, revoked: false, consented: true, clips: 3 },
      { id: sam.id, name: 'Sam', created: sam.created, revoked: false, consented: false, clips: 0 },
    ])
    expect(res.body).not.toContain(amira.token)
    expect(res.body).not.toContain('tokenHash')
  })

  it('revokes a contributor, keeping their clips', async () => {
    const c = await consentingContributor()
    await request('PUT', '/clips/allergens/milk_name.wav', { token: c.token, base64: wav() })

    const res = await request('DELETE', `/contributors/${c.id}`, { key: ADMIN_KEY })
    expect(res.statusCode).toBe(200)

    expect((await request('GET', '/me', { token: c.token })).statusCode).toBe(401)
    const { contributors } = json(await request('GET', '/contributors', { key: ADMIN_KEY }))
    expect(contributors[0]).toMatchObject({ id: c.id, revoked: true, clips: 1 })
  })

  it('treats revoking twice as done', async () => {
    const c = await addContributor()
    await request('DELETE', `/contributors/${c.id}`, { key: ADMIN_KEY })
    expect((await request('DELETE', `/contributors/${c.id}`, { key: ADMIN_KEY })).statusCode).toBe(200)
  })

  // A revoke is the only way to cut off a leaked link, so it must not be lost to
  // whatever else happened to be writing at the same moment.
  it('keeps a revoke and a competing add, rather than losing one', async () => {
    const amira = await addContributor()
    state.onContributorsWrite = () => {
      const current = JSON.parse(objects.get(CONTRIBUTORS))
      current.push({ id: 'sam-abcdef', name: 'Sam', tokenHash: 'f'.repeat(64), created: '2026-01-01T00:00:00.000Z', revoked: false })
      store(CONTRIBUTORS, JSON.stringify(current))
    }

    expect((await request('DELETE', `/contributors/${amira.id}`, { key: ADMIN_KEY })).statusCode).toBe(200)

    const { contributors } = json(await request('GET', '/contributors', { key: ADMIN_KEY }))
    expect(contributors.map(c => [c.id, c.revoked])).toEqual([[amira.id, true], ['sam-abcdef', false]])
  })

  it('keeps both of two contributors added at the same moment', async () => {
    const amira = await addContributor()
    state.onContributorsWrite = () => {
      const current = JSON.parse(objects.get(CONTRIBUTORS))
      current.push({ id: 'sam-abcdef', name: 'Sam', tokenHash: 'f'.repeat(64), created: '2026-01-01T00:00:00.000Z', revoked: false })
      store(CONTRIBUTORS, JSON.stringify(current))
    }

    const added = await addContributor('Noor')
    const ids = JSON.parse(objects.get(CONTRIBUTORS)).map(c => c.id)
    expect(ids).toEqual([amira.id, 'sam-abcdef', added.id])
  })

  it('returns 404 when revoking someone who does not exist', async () => {
    const res = await request('DELETE', '/contributors/nobody-000000', { key: ADMIN_KEY })
    expect(res.statusCode).toBe(404)
  })

  it('returns 500 for a body that is not JSON', async () => {
    const res = await handler({
      rawPath: '/contributors',
      requestContext: { http: { method: 'POST' } },
      headers: { 'x-admin-key': ADMIN_KEY },
      body: '{',
    })
    expect(res.statusCode).toBe(500)
  })
})

describe('contributor', () => {
  it.each([
    ['no token', undefined],
    ['an empty token', ''],
    ['an unknown token', 'not-a-real-token'],
  ])('rejects %s', async (_, token) => {
    await addContributor()
    expect((await request('GET', '/me', { token })).statusCode).toBe(401)
    expect((await request('PUT', '/clips/allergens/milk_name.wav', { token, base64: wav() })).statusCode).toBe(401)
  })

  it('rejects a token when the stored hash is unreadable, rather than failing open', async () => {
    store(CONTRIBUTORS, JSON.stringify([
      { id: 'amira-abcdef', name: 'Amira', tokenHash: 'not-hex', created: '2026-01-01T00:00:00.000Z', revoked: false },
    ]))
    expect((await request('GET', '/me', { token: 'not-hex' })).statusCode).toBe(401)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('tells a new contributor who they are, that they have not agreed yet, and that nothing is recorded', async () => {
    const c = await addContributor()
    const res = await request('GET', '/me', { token: c.token })
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ id: c.id, name: 'Amira Haddad', consented: false, clips: [], recordedByOthers: {} })
  })

  it('counts how many other people have recorded each phrase, not counting their own', async () => {
    listing.pageSize = 2
    const [a, b, c] = [await consentingContributor(), await consentingContributor(), await consentingContributor()]
    for (const who of [a, b]) {
      await request('PUT', '/clips/allergens/milk_name.wav', { token: who.token, base64: wav() })
    }
    await request('PUT', '/clips/allergens/eggs_name.wav', { token: b.token, base64: wav() })
    await request('PUT', '/clips/coffee/handle_name.wav', { token: c.token, base64: wav() })

    expect(json(await request('GET', '/me', { token: c.token })).recordedByOthers).toEqual({
      'allergens/milk_name.wav': 2,
      'allergens/eggs_name.wav': 1,
    })
    const forA = json(await request('GET', '/me', { token: a.token }))
    expect(forA.clips).toEqual([{ module: 'allergens', file: 'milk_name.wav' }])
    expect(forA.recordedByOthers).toEqual({
      'allergens/milk_name.wav': 1,
      'allergens/eggs_name.wav': 1,
      'coffee/handle_name.wav': 1,
    })
  })

  it('never names the other people', async () => {
    const other = await consentingContributor()
    await request('PUT', '/clips/allergens/milk_name.wav', { token: other.token, base64: wav() })
    const me = await addContributor('Sam')
    const body = (await request('GET', '/me', { token: me.token })).body
    expect(body).not.toContain(other.id)
    expect(body).not.toContain('Amira')
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

  describe('at the clip limit', () => {
    // The whole curriculum is well under the cap, so filling it means something is
    // wrong: a leaked link, or a script gone astray.
    async function contributorAtTheLimit() {
      const c = await consentingContributor()
      for (let n = 0; n < 600; n++) store(`clips/${c.id}/allergens/item-${n}_name.wav`, wav(0))
      return c
    }

    it('refuses a new clip', async () => {
      const c = await contributorAtTheLimit()
      const res = await request('PUT', '/clips/allergens/one-more_name.wav', { token: c.token, base64: wav() })
      expect(res.statusCode).toBe(403)
      expect(json(res)).toEqual({ error: 'Clip limit reached' })
      expect(objects.has(`clips/${c.id}/allergens/one-more_name.wav`)).toBe(false)
    })

    it('still lets an existing take be re-recorded', async () => {
      const c = await contributorAtTheLimit()
      const res = await request('PUT', '/clips/allergens/item-7_name.wav', { token: c.token, base64: wav(500) })
      expect(res.statusCode).toBe(200)
      expect(objects.get(`clips/${c.id}/allergens/item-7_name.wav`).length).toBe(544)
    })
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
