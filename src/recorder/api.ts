// Client for the contributor routes of the recordings Lambda
// (lambda-recordings/index.mjs). Every request carries the token from the
// contributor's link.

export interface Me {
  id: string
  name: string
  consented: boolean
  /** Clips already saved on the server, from this device or another. */
  clips: { module: string; file: string }[]
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
