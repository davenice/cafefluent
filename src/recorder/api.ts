// Client for the contributor routes of the recordings Lambda
// (lambda-recordings/index.mjs). Every request carries the token from the
// contributor's link.

export interface Me {
  id: string
  name: string
  consented: boolean
  /** Clips already saved on the server, from this device or another. */
  clips: { module: string; file: string }[]
  /**
   * How many other contributors have recorded each phrase, keyed by
   * "<module>/<file>". Missing from a function deployed before it was added.
   */
  recordedByOthers?: Record<string, number>
}

/** The Lambda answered, but not with success. A network failure is a TypeError from fetch instead. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export class RecordingsApi {
  private readonly base: URL
  private readonly token: string

  constructor(baseUrl: string, token: string) {
    // A relative base (such as a dev proxy path) resolves against this page.
    this.base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, window.location.href)
    this.token = token
  }

  private async call(method: string, path: string, body?: ArrayBuffer, contentType?: string): Promise<Response> {
    const res = await fetch(new URL(path, this.base), {
      method,
      headers: { 'x-contributor-token': this.token, ...(contentType ? { 'content-type': contentType } : {}) },
      body,
    })
    if (!res.ok) {
      const message = await res.json().then((b) => b?.error, () => undefined)
      throw new ApiError(res.status, message ?? `HTTP ${res.status}`)
    }
    return res
  }

  async me(): Promise<Me> {
    return (await this.call('GET', 'me')).json()
  }

  async consent(): Promise<void> {
    await this.call('POST', 'me/consent')
  }

  async putClip(module: string, file: string, wav: ArrayBuffer): Promise<void> {
    await this.call('PUT', `clips/${module}/${file}`, wav, 'audio/wav')
  }
}

/** A contributor as the admin routes list them. The token is never listed. */
export interface ContributorSummary {
  id: string
  name: string
  created: string
  revoked: boolean
  consented: boolean
  /** How many clips they have saved. */
  clips: number
}

/** Client for the admin routes, signed in with the same password as the config Lambda. */
export class RecordingsAdminApi {
  private readonly base: URL
  private readonly adminKey: string

  constructor(baseUrl: string, adminKey: string) {
    this.base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, window.location.href)
    this.adminKey = adminKey
  }

  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await fetch(new URL(path, this.base), {
      method,
      headers: { 'x-admin-key': this.adminKey, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const message = await res.json().then((b) => b?.error, () => undefined)
      throw new ApiError(res.status, message ?? `HTTP ${res.status}`)
    }
    return res
  }

  async list(): Promise<ContributorSummary[]> {
    return (await (await this.call('GET', 'contributors')).json()).contributors
  }

  /** Add someone. Their token comes back here and never again. */
  async add(name: string): Promise<{ contributor: ContributorSummary; token: string }> {
    const { contributor, token } = await (await this.call('POST', 'contributors', { name })).json()
    return { contributor: { ...contributor, consented: false, clips: 0 }, token }
  }

  async revoke(id: string): Promise<void> {
    await this.call('DELETE', `contributors/${encodeURIComponent(id)}`)
  }
}

/** The address a contributor's link opens. */
export function contributorLink(token: string): string {
  return new URL(`/record.html?t=${encodeURIComponent(token)}`, window.location.origin).href
}
