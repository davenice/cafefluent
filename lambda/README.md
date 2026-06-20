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

## Usage

- **GET** — returns `{ enabledModules: string[] }` (read by the app on startup)
- **POST with empty body + `x-admin-pin` header** — PIN check; returns `{ ok: true, enabledModules: string[] }`
- **POST with `{ enabledModules }` + `x-admin-pin` header** — saves new list to SSM; returns `{ ok: true }`
