# Progressive module enablement

Allow modules to be turned on/off server-side as the course progresses.

## Approach

AWS Lambda Function URL returns the list of enabled module IDs. The app fetches this on startup and filters the module list accordingly. Workbox caches the response with a network-first strategy so changes propagate on next app open, and the last known config is served when offline.

To unlock a module: AWS Console → Lambda → Configuration → Environment variables → update `ENABLED_MODULES`. No redeploy needed.

## Lambda

- **Runtime:** Node.js 20.x
- **Auth:** NONE (response contains no sensitive data)
- **Config:** `ENABLED_MODULES` environment variable, comma-separated module IDs e.g. `allergens,bread`

```js
export const handler = async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://your-cafefluent-domain.com',
  },
  body: JSON.stringify({
    enabledModules: (process.env.ENABLED_MODULES ?? '').split(',').map(s => s.trim()).filter(Boolean),
  }),
})
```

## App changes

### `src/hooks/useEnabledModules.ts` (new)

Fetches the Lambda URL once on startup. Returns `string[] | null` — `null` means loading or no cached response, which the app treats as "show all modules" so it never appears broken.

### `src/components/HomePage.tsx`

Filter `MODULES` using the hook result before rendering.

### `src/data/modules.ts`

No changes needed — the full module list remains the source of truth; enablement is a runtime filter only.

## Workbox (`vite.config.ts`)

Add a `runtimeCaching` rule for the Lambda URL:

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
- **Offline:** serves last cached response automatically

## Implementation checklist

- [ ] Create Lambda function with Function URL enabled
- [ ] Set `ENABLED_MODULES` environment variable
- [ ] Set CORS `Access-Control-Allow-Origin` to the deployed domain
- [ ] Add `src/hooks/useEnabledModules.ts`
- [ ] Update `src/components/HomePage.tsx` to filter by enabled modules
- [ ] Add `runtimeCaching` rule in `vite.config.ts`
