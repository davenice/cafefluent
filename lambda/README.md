# Module config Lambda

GET returns the list of enabled module IDs. POST (PIN-protected) updates it.

## Deploy

1. Zip the handler: `zip function.zip index.mjs`
2. AWS Console → Lambda → Create function
   - Runtime: Node.js 22.x
   - Architecture: x86_64
3. Upload `function.zip` as the code source
4. Configuration → Function URL → Create function URL
   - Auth type: NONE
5. Configuration → Environment variables → add:
   - `ADMIN_PIN` — a short numeric PIN known only to the instructor
   - `LOG_HMAC_KEY` — any long random string; used to pseudonymise caller IPs in logs
6. Configuration → Permissions → add inline policy:
   ```json
   {
     "Effect": "Allow",
     "Action": ["ssm:GetParameter", "ssm:PutParameter"],
     "Resource": "arn:aws:ssm:*:*:parameter/cafefluent/enabled-modules"
   }
   ```

## SSM Parameter

Create the parameter before first use:

AWS Console → Systems Manager → Parameter Store → Create parameter
- Name: `/cafefluent/enabled-modules`
- Type: String
- Value: `allergens,bread,coffee` (or whichever modules should be enabled initially)

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

- **GET** — returns `{ enabledModules: string[] }` (read by the app on startup)
- **POST with empty body + `x-admin-pin` header** — PIN check; returns `{ ok: true, enabledModules: string[] }`
- **POST with `{ enabledModules }` + `x-admin-pin` header** — saves new list to SSM; returns `{ ok: true }`
