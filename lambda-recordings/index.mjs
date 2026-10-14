import { randomBytes } from 'node:crypto'
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

const s3 = new S3Client()

// Bucket layout:
//   contributors.json                     every contributor, including their token
//   consent/<id>.json                     written when a contributor agrees to record
//   clips/<id>/<module>/<id>_<variant>.wav
// Consent lives in its own object so a contributor never writes contributors.json,
// which only the admin changes.
const CONTRIBUTORS_KEY = 'contributors.json'
const consentKey = id => `consent/${id}.json`
const clipPrefix = id => `clips/${id}/`

const MAX_NAME_LENGTH = 60
// Clips are 22,050 Hz 16-bit mono, about 44 KB a second, so this is over 20 seconds.
const MAX_CLIP_BYTES = 2 * 1024 * 1024
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const CLIP_FILE = /^[a-z0-9]+(-[a-z0-9]+)*_[a-z0-9]+(-[a-z0-9]+)*\.wav$/

const bucket = () => process.env.BUCKET

// --- Usage logging -----------------------------------------------------------
// One JSON line per request. Never logs a token.

function logRequest(event, route, statusCode, contributor) {
  console.log(JSON.stringify({
    event: 'request',
    method: event.requestContext?.http?.method ?? null,
    route,
    status: statusCode,
    contributor: contributor ?? null,
  }))
}

const ALLOWED_ORIGINS = new Set([
  'https://cafefluent.dandr.org',
  'http://localhost:5173',
  'http://localhost:4173',
])

function corsHeaders(event) {
  const origin = event.headers?.origin ?? ''
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://cafefluent.dandr.org',
    'Access-Control-Allow-Headers': 'content-type, x-admin-pin, x-contributor-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  }
}

// --- Storage -----------------------------------------------------------------

async function readContributors() {
  try {
    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: CONTRIBUTORS_KEY }))
    return JSON.parse(await Body.transformToString())
  } catch (err) {
    if (err.name === 'NoSuchKey') return []
    throw err
  }
}

function writeContributors(contributors) {
  return s3.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: CONTRIBUTORS_KEY,
    Body: JSON.stringify(contributors, null, 2),
    ContentType: 'application/json',
  }))
}

async function listKeys(prefix) {
  const keys = []
  let ContinuationToken
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken }))
    keys.push(...(page.Contents ?? []).map(o => o.Key))
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (ContinuationToken)
  return keys
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '')
}

function isWav(bytes) {
  return bytes.length > 44
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WAVE'
}

// --- Handler -----------------------------------------------------------------

export const handler = async (event) => {
  const result = await handleRequest(event)
  logRequest(event, result.route, result.response.statusCode, result.contributor)
  return result.response
}

async function handleRequest(event) {
  const headers = corsHeaders(event)
  const reply = (statusCode, body) => ({
    statusCode,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const method = event.requestContext?.http?.method
  const parts = (event.rawPath ?? '/').split('/').filter(Boolean)
  let route = 'unknown'
  let contributorId

  try {
    if (method === 'OPTIONS') return { route: 'OPTIONS', response: reply(204) }

    // Admin routes: /contributors
    if (parts[0] === 'contributors') {
      route = `${method} /contributors${parts.length > 1 ? '/:id' : ''}`
      if (event.headers?.['x-admin-pin'] !== process.env.ADMIN_PIN || !process.env.ADMIN_PIN) {
        console.warn('Failed admin PIN attempt')
        await new Promise(r => setTimeout(r, 2000))
        return { route, response: reply(401, { error: 'Unauthorized' }) }
      }
      return { route, response: await adminRoute(method, parts.slice(1), event, reply) }
    }

    // Contributor routes: /me, /me/consent, /clips/:module/:file
    if (parts[0] === 'me' || parts[0] === 'clips') {
      route = parts[0] === 'clips' ? `${method} /clips/:module/:file` : `${method} /${parts.join('/')}`
      const token = event.headers?.['x-contributor-token']
      const contributor = token ? (await readContributors()).find(c => c.token === token) : undefined
      if (!contributor || contributor.revoked) {
        return { route, response: reply(401, { error: 'Unknown or revoked link' }) }
      }
      contributorId = contributor.id
      return { route, contributor: contributorId, response: await contributorRoute(method, parts, event, contributor, reply) }
    }

    return { route, response: reply(404, { error: 'Not found' }) }
  } catch (err) {
    console.error(err)
    return { route, contributor: contributorId, response: reply(500, { error: 'Internal error' }) }
  }
}

async function adminRoute(method, rest, event, reply) {
  // GET /contributors: everyone, with how many clips each has recorded
  if (method === 'GET' && rest.length === 0) {
    const [contributors, clipKeys, consentKeys] = await Promise.all([
      readContributors(), listKeys('clips/'), listKeys('consent/'),
    ])
    const clips = {}
    for (const key of clipKeys) {
      const id = key.split('/')[1]
      clips[id] = (clips[id] ?? 0) + 1
    }
    const consented = new Set(consentKeys.map(k => k.slice('consent/'.length, -'.json'.length)))
    return reply(200, {
      contributors: contributors.map(c => ({ ...c, consented: consented.has(c.id), clips: clips[c.id] ?? 0 })),
    })
  }

  // POST /contributors { name }: add one and return their token
  if (method === 'POST' && rest.length === 0) {
    const body = event.body ? JSON.parse(event.body) : {}
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > MAX_NAME_LENGTH) {
      return reply(400, { error: `Name must be 1 to ${MAX_NAME_LENGTH} characters` })
    }
    const contributor = {
      id: `${slugify(name) || 'contributor'}-${randomBytes(3).toString('hex')}`,
      name,
      token: randomBytes(16).toString('base64url'),
      created: new Date().toISOString(),
      revoked: false,
    }
    const contributors = await readContributors()
    await writeContributors([...contributors, contributor])
    return reply(201, { contributor })
  }

  // DELETE /contributors/:id: revoke their link. Their clips are kept.
  if (method === 'DELETE' && rest.length === 1) {
    const contributors = await readContributors()
    const contributor = contributors.find(c => c.id === rest[0])
    if (!contributor) return reply(404, { error: 'No such contributor' })
    contributor.revoked = true
    await writeContributors(contributors)
    return reply(200, { ok: true })
  }

  return reply(404, { error: 'Not found' })
}

async function contributorRoute(method, parts, event, contributor, reply) {
  const { id } = contributor

  // GET /me: who they are, whether they have agreed, and what they have recorded
  if (method === 'GET' && parts.length === 1 && parts[0] === 'me') {
    const [clipKeys, consentKeys] = await Promise.all([listKeys(clipPrefix(id)), listKeys(consentKey(id))])
    const clips = clipKeys.map(key => {
      const [module, file] = key.slice(clipPrefix(id).length).split('/')
      return { module, file }
    })
    return reply(200, { id, name: contributor.name, consented: consentKeys.length > 0, clips })
  }

  // POST /me/consent: they agree to their voice being recorded and used in the app
  if (method === 'POST' && parts.length === 2 && parts[0] === 'me' && parts[1] === 'consent') {
    await s3.send(new PutObjectCommand({
      Bucket: bucket(),
      Key: consentKey(id),
      Body: JSON.stringify({ id, name: contributor.name, at: new Date().toISOString() }),
      ContentType: 'application/json',
    }))
    return reply(200, { ok: true })
  }

  // PUT /clips/:module/:file: save one recording, replacing any earlier take
  if (method === 'PUT' && parts.length === 3 && parts[0] === 'clips') {
    const [, module, file] = parts
    if (!SLUG.test(module) || !CLIP_FILE.test(file)) {
      return reply(400, { error: 'Invalid module or file name' })
    }
    if ((await listKeys(consentKey(id))).length === 0) {
      return reply(403, { error: 'Consent needed before recording' })
    }
    const bytes = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'binary')
    if (bytes.length > MAX_CLIP_BYTES) return reply(413, { error: 'Clip too large' })
    if (!isWav(bytes)) return reply(400, { error: 'Not a WAV file' })
    await s3.send(new PutObjectCommand({
      Bucket: bucket(),
      Key: `${clipPrefix(id)}${module}/${file}`,
      Body: bytes,
      ContentType: 'audio/wav',
    }))
    return reply(200, { ok: true })
  }

  return reply(404, { error: 'Not found' })
}
