# Module config Lambda

GET returns the list of enabled module IDs and the table game settings. POST (password-protected) updates them.

## Deploy

1. Zip the handler: `zip function.zip index.mjs`
2. AWS Console → Lambda → Create function
   - Runtime: Node.js 22.x
   - Architecture: x86_64
3. Upload `function.zip` as the code source
4. Configuration → Function URL → Create function URL
   - Auth type: NONE
5. Configuration → Environment variables → add:
   - `ADMIN_KEY` — the admin password. The admin page takes any length, so make it
     long: `node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"`
   - `LOG_HMAC_KEY` — any long random string; used to pseudonymise caller IPs in logs

   `ADMIN_PIN` is read as a fallback so the old six-digit PIN keeps working until
   `ADMIN_KEY` is set. Once it is, delete `ADMIN_PIN`: a six-digit PIN is short
   enough to guess by brute force, because the function URL is open to anyone and
   the 2 second delay on a wrong answer does not slow down attempts made in
   parallel.
6. Configuration → Permissions → add inline policy:
   ```json
   {
     "Effect": "Allow",
     "Action": ["ssm:GetParameter", "ssm:PutParameter"],
     "Resource": [
       "arn:aws:ssm:*:*:parameter/cafefluent/enabled-modules",
       "arn:aws:ssm:*:*:parameter/cafefluent/game-settings"
     ]
   }
   ```

## SSM Parameter

Create the parameter before first use:

AWS Console → Systems Manager → Parameter Store → Create parameter
- Name: `/cafefluent/enabled-modules`
- Type: String
- Value: `allergens,bread,coffee` (or whichever modules should be enabled initially)

`/cafefluent/game-settings` holds the table game's words, turn length and number
of turns as JSON. It doesn't need creating by hand: the admin page creates it on
first save, and until then the Lambda returns `game: null`.

## CORS

Allowed origins are hardcoded in `index.mjs`:
- `https://cafefluent.dandr.org`
- `http://localhost:5173`
- `http://localhost:4173`

## Usage logging

Every request writes one JSON line to CloudWatch Logs, e.g.

```json
{"event":"request","method":"GET","status":200,"origin":"https://cafefluent.dandr.org","ua":"android","client":"3f9a1c2b7d4e"}
```

- `client` is an HMAC of the source IP keyed by `LOG_HMAC_KEY`. It is stable per
  network, so you can count distinct callers and recognise your own, but the raw
  IP is never logged. If `LOG_HMAC_KEY` is unset, `client` is `null`.
- `origin` is the production site for real traffic. Dev traffic goes through the
  Vite proxy, so its GETs arrive with no Origin header (`null`) and its POSTs
  carry the dev server's origin.

Set a retention period on the log group (CloudWatch → Log groups →
`/aws/lambda/<function>` → Edit retention), e.g. 90 days; the default is never.

Useful Logs Insights queries:

```
# app opens per day, excluding dev traffic
filter event = "request" and method = "GET" and origin = "https://cafefluent.dandr.org"
| stats count() as opens by bin(1d)

# distinct callers per day
filter event = "request" and method = "GET" and origin = "https://cafefluent.dandr.org"
| stats count_distinct(client) as callers, count() as requests by bin(1d)
```

## Usage

The e2e tests use a copy of this contract in `e2e/fakeConfigApi.ts`, and
`index.test.mjs` tests the handler itself. When you change the handler, update
both, and the e2e tests in `e2e/enablement.spec.ts`.

- **GET** — returns `{ enabledModules: string[], game: GameSettings | null }` (read by the app on startup)
- **POST with empty body + `x-admin-key` header** — sign-in check; returns `{ ok: true, enabledModules, game }`
- **POST with `{ enabledModules, game }` + `x-admin-key` header** — saves either or both to SSM; returns `{ ok: true }`

`x-admin-pin` is still accepted alongside `x-admin-key`, so the function and the
site can be deployed minutes apart. Drop both old names once the site is live.
A wrong or missing password gets a 401 after a 2 second delay. With no secret
configured at all, every POST is refused.

`GameSettings` is `{ words: string[], seconds: number, turns: number }`.
