import type { BrowserContext, Route } from '@playwright/test'

// Must match VITE_RECORDINGS_API_URL in .env.e2e.
export const RECORDINGS_API_URL = 'https://recordings.test/'

export interface FakeContributor {
  id: string
  name: string
  token: string
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
 * Not copied: the admin routes (no e2e test uses them yet), S3, and logging.
 */
export class FakeRecordingsApi {
  readonly contributors: FakeContributor[] = []
  mode: Mode = 'ok'

  add(name: string, { consented = false } = {}): FakeContributor {
    const n = this.contributors.length + 1
    const contributor = {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-00000${n}`,
      name,
      token: `test-token-${n}`,
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
}
