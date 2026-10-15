import type { BrowserContext, Route } from '@playwright/test'
import { TEST_ADMIN_KEY } from './fakeConfigApi'

// Must match VITE_RECORDINGS_API_URL in .env.e2e.
export const RECORDINGS_API_URL = 'https://recordings.test/'

export interface FakeContributor {
  id: string
  name: string
  token: string
  created: string
  revoked: boolean
  consented: boolean
  /** Saved clips, keyed by "<module>/<file>". */
  clips: Map<string, Buffer>
}

// 'error' answers like the Lambda's catch-all 500; 'offline' fails the request
// as a dropped connection would.
type Mode = 'ok' | 'error' | 'offline'

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const CLIP_FILE = /^[a-z0-9]+(-[a-z0-9]+)*_[a-z0-9]+(-[a-z0-9]+)*\.wav$/
const MAX_CLIP_BYTES = 2 * 1024 * 1024
const MAX_CLIPS = 600

/**
 * A stand-in for the contributor routes of the recordings Lambda
 * (lambda-recordings/index.mjs), answering the e2e build's API URL inside the
 * browser. It copies the Lambda's request/response contract, so if the Lambda
 * changes, change this to match (see "Testing" in README.md).
 *
 * The admin password is the config fake's TEST_ADMIN_KEY, as both functions
 * share one ADMIN_KEY. Not copied: token hashing, S3, and logging.
 */
export class FakeRecordingsApi {
  readonly contributors: FakeContributor[] = []
  mode: Mode = 'ok'
  /** Accepted admin password. Change it to test the two functions' passwords not matching. */
  adminKey = TEST_ADMIN_KEY

  add(name: string, { consented = false } = {}): FakeContributor {
    const n = this.contributors.length + 1
    const contributor = {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-00000${n}`,
      name,
      token: `test-token-${n}`,
      created: '2026-10-01T09:00:00.000Z',
      revoked: false,
      consented,
      clips: new Map(),
    }
    this.contributors.push(contributor)
    return contributor
  }

  async install(context: BrowserContext) {
    await context.route(`${RECORDINGS_API_URL}**`, route => this.handle(route))
  }

  private async handle(route: Route) {
    const request = route.request()
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': request.headers().origin ?? '*',
      'Access-Control-Allow-Headers': 'content-type, x-admin-key, x-contributor-token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      Vary: 'Origin',
    }
    const reply = (status: number, body?: unknown) =>
      route.fulfill({ status, headers, body: body === undefined ? '' : JSON.stringify(body) })

    if (this.mode === 'offline') return route.abort('internetdisconnected')
    const method = request.method()
    if (method === 'OPTIONS') return reply(204)
    if (this.mode === 'error') return reply(500, { error: 'Internal error' })

    const parts = new URL(request.url()).pathname.split('/').filter(Boolean)
    if (parts[0] === 'contributors') return this.handleAdmin(route, method, parts.slice(1), reply)
    if (parts[0] !== 'me' && parts[0] !== 'clips') return reply(404, { error: 'Not found' })

    const token = request.headers()['x-contributor-token']
    const contributor = this.contributors.find(c => c.token === token)
    if (!contributor || contributor.revoked) return reply(401, { error: 'Unknown or revoked link' })

    if (method === 'GET' && parts.length === 1 && parts[0] === 'me') {
      const clips = [...contributor.clips.keys()].map(key => {
        const [module, file] = key.split('/')
        return { module, file }
      })
      return reply(200, { id: contributor.id, name: contributor.name, consented: contributor.consented, clips })
    }

    if (method === 'POST' && parts.length === 2 && parts[0] === 'me' && parts[1] === 'consent') {
      contributor.consented = true
      return reply(200, { ok: true })
    }

    if (method === 'PUT' && parts.length === 3 && parts[0] === 'clips') {
      const [, module, file] = parts
      if (!SLUG.test(module) || !CLIP_FILE.test(file)) return reply(400, { error: 'Invalid module or file name' })
      if (!contributor.consented) return reply(403, { error: 'Consent needed before recording' })
      const key = `${module}/${file}`
      if (!contributor.clips.has(key) && contributor.clips.size >= MAX_CLIPS) {
        return reply(403, { error: 'Clip limit reached' })
      }
      const bytes = request.postDataBuffer() ?? Buffer.alloc(0)
      if (bytes.length > MAX_CLIP_BYTES) return reply(413, { error: 'Clip too large' })
      const isWav = bytes.length > 44
        && bytes.toString('ascii', 0, 4) === 'RIFF'
        && bytes.toString('ascii', 8, 12) === 'WAVE'
      if (!isWav) return reply(400, { error: 'Not a WAV file' })
      contributor.clips.set(key, bytes)
      return reply(200, { ok: true })
    }

    return reply(404, { error: 'Not found' })
  }

  private handleAdmin(route: Route, method: string, rest: string[], reply: (status: number, body?: unknown) => Promise<void>) {
    if (route.request().headers()['x-admin-key'] !== this.adminKey) return reply(401, { error: 'Unauthorized' })

    const publicContributor = (c: FakeContributor) => ({ id: c.id, name: c.name, created: c.created, revoked: c.revoked })

    if (method === 'GET' && rest.length === 0) {
      return reply(200, {
        contributors: this.contributors.map(c => ({ ...publicContributor(c), consented: c.consented, clips: c.clips.size })),
      })
    }

    if (method === 'POST' && rest.length === 0) {
      const body = route.request().postData() ? route.request().postDataJSON() : {}
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name || name.length > 60) return reply(400, { error: 'Name must be 1 to 60 characters' })
      const contributor = this.add(name)
      return reply(201, { contributor: publicContributor(contributor), token: contributor.token })
    }

    if (method === 'DELETE' && rest.length === 1) {
      const contributor = this.contributors.find(c => c.id === decodeURIComponent(rest[0]))
      if (!contributor) return reply(404, { error: 'No such contributor' })
      contributor.revoked = true
      return reply(200, { ok: true })
    }

    return reply(404, { error: 'Not found' })
  }
}
