# Progressive module enablement

Allow modules to be turned on/off server-side as the course progresses.

## Approach

AWS Lambda Function URL returns the list of enabled module IDs. The app fetches this on startup and filters the module list accordingly. Workbox caches the response with a network-first strategy so changes propagate on next app open, and the last known config is served when offline.

The enabled module list is stored in SSM Parameter Store and managed via a simple `/admin` page in the app — instructors never need to touch the AWS Console.

## SSM Parameter Store

One parameter: `/cafefluent/enabled-modules` — a comma-separated string of module IDs e.g. `allergens,bread`. This is the source of truth for which modules are enabled.

## Lambda

- **Runtime:** Node.js 20.x
- **Auth:** NONE (GET response contains no sensitive data; POST is PIN-protected)
- **Env vars:** `ADMIN_PIN` — checked server-side on every POST request
- **IAM:** `ssm:GetParameter` and `ssm:PutParameter` on `/cafefluent/enabled-modules`

The handler supports two methods on the same Function URL:

**GET** — reads the SSM param, returns `{ enabledModules: [...] }`

**POST** — checks the `x-admin-pin` header against `ADMIN_PIN`. On match, writes the new module list back to SSM. Returns `200` or `401`.

```js
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm'

const ssm = new SSMClient()
const SSM_NAME = '/cafefluent/enabled-modules'
const CORS = { 'Access-Control-Allow-Origin': 'https://your-cafefluent-domain.com' }

export const handler = async (event) => {
  if (event.requestContext.http.method === 'POST') {
    if (event.headers['x-admin-pin'] !== process.env.ADMIN_PIN) {
      return { statusCode: 401, body: 'Unauthorized' }
    }
    const { enabledModules } = JSON.parse(event.body)
    await ssm.send(new PutParameterCommand({
      Name: SSM_NAME,
      Value: enabledModules.join(','),
      Overwrite: true,
    }))
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) }
  }

  const param = await ssm.send(new GetParameterCommand({ Name: SSM_NAME }))
  const enabledModules = param.Parameter.Value.split(',').map(s => s.trim()).filter(Boolean)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify({ enabledModules }),
  }
}
```

## App changes

### `src/hooks/useEnabledModules.ts` (new)

Fetches the Lambda URL once on startup via GET. Returns `string[] | null` — `null` means loading or no cached response, which the app treats as "show all modules" so it never appears broken.

### `src/components/HomePage.tsx`

Filter `MODULES` using the hook result before rendering.

### `src/components/AdminPage.tsx` (new)

Two-state component — instructors navigate to `/admin` directly (no link from the main UI):

1. **PIN screen** — 4-digit input. Wrong PIN shows an error. Correct PIN advances to the module screen. The PIN is held in component state only for the session, never persisted client-side.
2. **Module screen** — fetches current state from the Lambda GET, renders a labelled toggle for each entry in `MODULES`. Save button POSTs `{ enabledModules }` with the PIN in an `x-admin-pin` header. Shows a confirmation toast on success.

### `src/App.tsx`

Add a `/admin` route pointing to `AdminPage`.

### `src/data/modules.ts`

No changes needed — the full module list remains the source of truth; enablement is a runtime filter only.

## Workbox (`vite.config.ts`)

Add a `runtimeCaching` rule for the Lambda URL (GET responses only — Workbox does not cache POST requests by default):

```ts
runtimeCaching: [
  {
    urlPattern: /^https:\/\/your-lambda-url\.lambda-url\.\S+\.on\.aws/,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'module-config',
      networkTimeoutSeconds: 3,
      expiration: { maxEntries: 1 },
    },
  },
],
```

- **Online:** fetches fresh config — instructor changes propagate on next app open
- **Offline:** serves last cached GET response automatically

## Implementation checklist

- [ ] Create SSM parameter `/cafefluent/enabled-modules` with initial value
- [ ] Create Lambda function with Function URL enabled
- [ ] Add `ADMIN_PIN` environment variable to Lambda
- [ ] Add `ssm:GetParameter` + `ssm:PutParameter` to Lambda IAM role
- [ ] Set CORS `Access-Control-Allow-Origin` to the deployed domain
- [ ] Add `src/hooks/useEnabledModules.ts`
- [ ] Update `src/components/HomePage.tsx` to filter by enabled modules
- [ ] Add `src/components/AdminPage.tsx` (PIN screen + module toggle screen)
- [ ] Add `/admin` route in `src/App.tsx`
- [ ] Add `runtimeCaching` rule in `vite.config.ts`
