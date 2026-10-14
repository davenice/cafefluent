import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

const s3 = new S3Client()

// Bucket layout:
//   contributors.json                     every contributor, with a hash of their token
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
// The whole curriculum is around 200 clips a contributor. Generous enough never to
// be met by hand, low enough that a leaked token cannot fill the bucket.
const MAX_CLIPS = 600
// How many times to re-read and retry when another write to contributors.json
// lands first.
const WRITE_ATTEMPTS = 5
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const CLIP_FILE = /^[a-z0-9]+(-[a-z0-9]+)*_[a-z0-9]+(-[a-z0-9]+)*\.wav$/

const bucket = () => process.env.BUCKET

// --- Secrets -----------------------------------------------------------------

const sha256 = value => createHash('sha256').update(value).digest()

// Hashing first makes the comparison fixed-length, so neither the secret nor its
// length leaks through timing.
function secretMatches(given, expected) {
  if (!expected || typeof given !== 'string') return false
  return timingSafeEqual(sha256(given), sha256(expected))
}

// Fails closed: with ADMIN_KEY unset, nothing reaches the admin routes.
const adminKeyMatches = event => secretMatches(event.headers?.['x-admin-key'], process.env.ADMIN_KEY)

// Only the hash of a token is stored, so a leaked copy of contributors.json is
// not a set of working links.
const hashToken = token => sha256(token).toString('hex')

function findByToken(contributors, token) {
  if (typeof token !== 'string' || !token) return undefined
  const wanted = sha256(token)
  return contributors.find(c => {
    if (typeof c.tokenHash !== 'string') return false
    const stored = Buffer.from(c.tokenHash, 'hex')
    return stored.length === wanted.length && timingSafeEqual(stored, wanted)
  })
}

// The only fields that ever leave the function. The token hash stays in the bucket.
const publicContributor = c => ({
  id: c.id,
  name: c.name,
  created: c.created,
  revoked: c.revoked === true,
})

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

// Localhost is allowed only where ALLOW_LOCALHOST is set, so production
// advertises the real site alone.
const SITE_ORIGIN = 'https://cafefluent.dandr.org'
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4173']

function allowedOrigin(origin) {
  const allowed = process.env.ALLOW_LOCALHOST === 'true' ? [SITE_ORIGIN, ...DEV_ORIGINS] : [SITE_ORIGIN]
  return allowed.includes(origin) ? origin : SITE_ORIGIN
}

function corsHeaders(event) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin(event.headers?.origin ?? ''),
    'Access-Control-Allow-Headers': 'content-type, x-admin-key, x-contributor-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    // The allowed origin depends on the request, so caches must not share one answer.
    Vary: 'Origin',
  }
}

// --- Storage -----------------------------------------------------------------

async function readContributors() {
  try {
    const { Body, ETag } = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: CONTRIBUTORS_KEY }))
    return { contributors: JSON.parse(await Body.transformToString()), etag: ETag }
  } catch (err) {
    if (err.name === 'NoSuchKey') return { contributors: [], etag: undefined }
    throw err
  }
}

function writeContributors(contributors, etag) {
  return s3.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: CONTRIBUTORS_KEY,
    Body: JSON.stringify(contributors, null, 2),
    ContentType: 'application/json',
    // Refuse the write if the file changed since it was read, or if it appeared
    // when we read none.
    ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
  }))
}

const isWriteConflict = err =>
  err.name === 'PreconditionFailed'
  || err.name === 'ConditionalRequestConflict'
  || [409, 412].includes(err.$metadata?.httpStatusCode)

// Read contributors.json, let `change` alter the list, then write it back only if
// nothing else wrote to it meanwhile. Otherwise start again from the new version.
// Without this an add and a revoke that overlap would lose one of the two, and a
// lost revoke leaves a link working that someone meant to cut off.
async function updateContributors(change) {
  for (let attempt = 1; ; attempt++) {
    const { contributors, etag } = await readContributors()
    const outcome = change(contributors)
    if (!outcome.write) return outcome
    try {
      await writeContributors(contributors, etag)
      return outcome
    } catch (err) {
      if (attempt === WRITE_ATTEMPTS || !isWriteConflict(err)) throw err
    }
  }
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

// The id is the contributor's folder in the bucket, so two people must never
// share one.
function newId(name, contributors) {
  const base = slugify(name) || 'contributor'
  for (;;) {
    const id = `${base}-${randomBytes(3).toString('hex')}`
    if (!contributors.some(c => c.id === id)) return id
  }
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
      if (!adminKeyMatches(event)) {
        console.warn('Failed admin sign-in')
        return { route, response: reply(401, { error: 'Unauthorized' }) }
      }
      return { route, response: await adminRoute(method, parts.slice(1), event, reply) }
    }

    // Contributor routes: /me, /me/consent, /clips/:module/:file
    if (parts[0] === 'me' || parts[0] === 'clips') {
      route = parts[0] === 'clips' ? `${method} /clips/:module/:file` : `${method} /${parts.join('/')}`
      const { contributors } = await readContributors()
      const contributor = findByToken(contributors, event.headers?.['x-contributor-token'])
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
    const [{ contributors }, clipKeys, consentKeys] = await Promise.all([
      readContributors(), listKeys('clips/'), listKeys('consent/'),
    ])
    const clips = {}
    for (const key of clipKeys) {
      const id = key.split('/')[1]
      clips[id] = (clips[id] ?? 0) + 1
    }
    const consented = new Set(consentKeys.map(k => k.slice('consent/'.length, -'.json'.length)))
    return reply(200, {
      contributors: contributors.map(c => ({
        ...publicContributor(c),
        consented: consented.has(c.id),
        clips: clips[c.id] ?? 0,
      })),
    })
  }

  // POST /contributors { name }: add one and return their token, once
  if (method === 'POST' && rest.length === 0) {
    const body = event.body ? JSON.parse(event.body) : {}
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > MAX_NAME_LENGTH) {
      return reply(400, { error: `Name must be 1 to ${MAX_NAME_LENGTH} characters` })
    }
    // Returned here and never again: only its hash is stored, so a lost link has
    // to be replaced rather than looked up.
    const token = randomBytes(16).toString('base64url')
    const { contributor } = await updateContributors(contributors => {
      const contributor = {
        id: newId(name, contributors),
        name,
        tokenHash: hashToken(token),
        created: new Date().toISOString(),
        revoked: false,
      }
      contributors.push(contributor)
      return { write: true, contributor }
    })
    return reply(201, { contributor: publicContributor(contributor), token })
  }

  // DELETE /contributors/:id: revoke their link. Their clips are kept.
  if (method === 'DELETE' && rest.length === 1) {
    const { found } = await updateContributors(contributors => {
      const contributor = contributors.find(c => c.id === rest[0])
      if (!contributor) return { write: false, found: false }
      // Already revoked, so there is nothing to write.
      if (contributor.revoked) return { write: false, found: true }
      contributor.revoked = true
      return { write: true, found: true }
    })
    return found ? reply(200, { ok: true }) : reply(404, { error: 'No such contributor' })
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
    const [consentKeys, clipKeys] = await Promise.all([
      listKeys(consentKey(id)), listKeys(clipPrefix(id)),
    ])
    if (consentKeys.length === 0) {
      return reply(403, { error: 'Consent needed before recording' })
    }
    const key = `${clipPrefix(id)}${module}/${file}`
    // Re-recording a take is always allowed. Only a new one counts against the cap.
    if (!clipKeys.includes(key) && clipKeys.length >= MAX_CLIPS) {
      return reply(403, { error: 'Clip limit reached' })
    }
    const bytes = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'binary')
    if (bytes.length > MAX_CLIP_BYTES) return reply(413, { error: 'Clip too large' })
    if (!isWav(bytes)) return reply(400, { error: 'Not a WAV file' })
    await s3.send(new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: bytes,
      ContentType: 'audio/wav',
    }))
    return reply(200, { ok: true })
  }

  return reply(404, { error: 'Not found' })
}
