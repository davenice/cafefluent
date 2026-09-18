import { createHmac } from 'node:crypto'
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm'

const ssm = new SSMClient()
const SSM_NAME = '/cafefluent/enabled-modules'

// --- Usage logging -----------------------------------------------------------
// One JSON line per request, queryable in CloudWatch Logs Insights.
// The raw IP is never written: it is reduced to an HMAC, a stable pseudonymous
// id per network.

function clientId(ip) {
  const key = process.env.LOG_HMAC_KEY
  if (!key || !ip) return null
  return createHmac('sha256', key).update(ip).digest('hex').slice(0, 12)
}

function uaFamily(ua = '') {
  if (/iPhone|iPad/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows/.test(ua)) return 'windows'
  if (/Macintosh/.test(ua)) return 'mac'
  if (/Linux/.test(ua)) return 'linux'
  return 'other'
}

function logRequest(event, statusCode) {
  const http = event.requestContext?.http ?? {}
  console.log(JSON.stringify({
    event: 'request',
    method: http.method ?? null,
    status: statusCode,
    origin: event.headers?.origin ?? null,
    ua: uaFamily(http.userAgent ?? event.headers?.['user-agent']),
    client: clientId(http.sourceIp),
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
    'Access-Control-Allow-Headers': 'content-type, x-admin-pin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

async function getEnabledModules() {
  const { Parameter } = await ssm.send(new GetParameterCommand({ Name: SSM_NAME }))
  return Parameter.Value.split(',').map(s => s.trim()).filter(Boolean)
}

export const handler = async (event) => {
  const response = await handleRequest(event)
  logRequest(event, response.statusCode)
  return response
}

async function handleRequest(event) {
  const headers = corsHeaders(event)
  try {
    const method = event.requestContext.http.method

    if (method === 'OPTIONS') {
      return { statusCode: 204, headers }
    }

    if (method === 'POST') {
      if (event.headers['x-admin-pin'] !== process.env.ADMIN_PIN) {
        console.warn(`Failed PIN attempt from client ${clientId(event.requestContext?.http?.sourceIp) ?? 'unknown'}`)
        await new Promise(r => setTimeout(r, 2000))
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      }

      const body = event.body ? JSON.parse(event.body) : {}
      const enabledModules = await getEnabledModules()

      if (Array.isArray(body.enabledModules)) {
        await ssm.send(new PutParameterCommand({
          Name: SSM_NAME,
          Value: body.enabledModules.join(','),
          Type: 'String',
          Overwrite: true,
        }))
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
      }

      // PIN check only — return current state
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, enabledModules }) }
    }

    const enabledModules = await getEnabledModules()
    return { statusCode: 200, headers, body: JSON.stringify({ enabledModules }) }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) }
  }
}
