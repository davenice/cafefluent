import type { BrowserContext, Route } from '@playwright/test'

// Must match VITE_MODULES_API_URL in .env.e2e.
export const API_URL = 'https://modules.test/'
export const TEST_ADMIN_KEY = 'test-admin-key'

export interface GameSettings {
  words: string[]
  seconds: number
  turns: number
}

export interface ConfigState {
  enabledModules: string[]
  game: GameSettings | null
}

// 'error' answers like the Lambda's catch-all 500; 'offline' fails the request
// as a dropped connection would.
type Mode = 'ok' | 'error' | 'offline'

/**
 * A stand-in for the config Lambda (lambda/index.mjs), answering the e2e build's
 * API URL inside the browser. It copies the Lambda's request/response contract,
 * so if the Lambda changes, change this to match (see "Testing" in README.md).
 *
 * Not copied: CloudWatch logging, and the 2 second delay on a wrong password.
 */
export class FakeConfigApi {
  state: ConfigState
  mode: Mode = 'ok'
  // Bodies of the POSTs that got past the sign-in, for asserting on what was saved.
  readonly posts: unknown[] = []
  // Header names the last sign-in arrived under, for asserting on compatibility.
  authHeaderNames: string[] = []

  constructor(initial: Partial<ConfigState> = {}) {
    this.state = { enabledModules: [], game: null, ...initial }
  }

  async install(context: BrowserContext) {
    await context.route(`${API_URL}**`, route => this.handle(route))
  }

  private async handle(route: Route) {
    const request = route.request()
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': request.headers().origin ?? '*',
      'Access-Control-Allow-Headers': 'content-type, x-admin-key, x-admin-pin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      Vary: 'Origin',
    }
    const reply = (status: number, body?: unknown) =>
      route.fulfill({ status, headers, body: body === undefined ? '' : JSON.stringify(body) })

    if (this.mode === 'offline') return route.abort('internetdisconnected')
    if (request.method() === 'OPTIONS') return reply(204)
    if (this.mode === 'error') return reply(500, { error: 'Internal error' })

    if (request.method() === 'POST') {
      // Either header name is accepted, as the Lambda does for one release.
      const sent = request.headers()
      this.authHeaderNames = ['x-admin-key', 'x-admin-pin'].filter(h => sent[h] !== undefined)
      const given = sent['x-admin-key'] ?? sent['x-admin-pin']
      if (!given || given !== TEST_ADMIN_KEY) {
        return reply(401, { error: 'Unauthorized' })
      }

      const body = request.postData() ? request.postDataJSON() : {}
      const saveModules = Array.isArray(body.enabledModules)
      const saveGame = body.game !== undefined

      if (saveGame && !validGameSettings(body.game)) {
        return reply(400, { error: 'Invalid game settings' })
      }
      if (saveModules || saveGame) {
        this.posts.push(body)
        if (saveModules) this.state.enabledModules = body.enabledModules
        if (saveGame) this.state.game = body.game
        return reply(200, { ok: true })
      }

      // Sign-in check only — return current state
      return reply(200, { ok: true, ...this.state })
    }

    return reply(200, this.state)
  }
}

function validGameSettings(game: GameSettings) {
  return game && typeof game === 'object'
    && Array.isArray(game.words) && game.words.every(w => typeof w === 'string')
    && Number.isInteger(game.seconds) && Number.isInteger(game.turns)
}
