# Module config Lambda

Returns the list of enabled module IDs to the app.

## Deploy

1. Zip the handler: `zip function.zip index.mjs`
2. AWS Console → Lambda → Create function
   - Runtime: Node.js 22.x
   - Architecture: x86_64
3. Upload `function.zip` as the code source
4. Configuration → Function URL → Create function URL
   - Auth type: NONE
5. Configuration → Permissions → add inline policy:
   _(no extra permissions needed at this stage — SSM comes later)_

## CORS

`Access-Control-Allow-Origin` is set to `https://cafefluent.dandr.org`.

## Next steps

- Wire the Function URL into the app via `VITE_MODULES_API_URL`
- Replace the hard-coded list with SSM Parameter Store (see `progressive-enablement.md`)
- Add POST endpoint + `ADMIN_PIN` for the admin UI
