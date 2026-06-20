import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm'

const ssm = new SSMClient()
const SSM_NAME = '/cafefluent/enabled-modules'

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
  }
}

async function getEnabledModules() {
  const { Parameter } = await ssm.send(new GetParameterCommand({ Name: SSM_NAME }))
  return Parameter.Value.split(',').map(s => s.trim()).filter(Boolean)
}

export const handler = async (event) => {
  const headers = corsHeaders(event)
  try {
    const method = event.requestContext.http.method

    if (method === 'POST') {
      if (event.headers['x-admin-pin'] !== process.env.ADMIN_PIN) {
        const ip = event.requestContext?.http?.sourceIp ?? 'unknown'
        console.warn(`Failed PIN attempt from ${ip}`)
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
