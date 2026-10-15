# Recordings Lambda

Stores the voice clips contributors record. The admin adds a contributor and
sends them a personal link. The link's token lets them save clips straight to
S3, with no zip file to send.

It is separate from the module config Lambda (`lambda/`), so it alone can write
to the recordings bucket, and the config Lambda's contract is unchanged.

## Deploy

1. Create the bucket: S3 → Create bucket
   - Name: e.g. `cafefluent-recordings`, in the same region as the function
   - Block all public access: **on** (the default). Only the Lambda reads or writes it.
   - Bucket Versioning: **enable**. Saving a clip replaces the earlier take, so
     versioning is what makes a take recoverable if one is overwritten by mistake,
     or by a link that leaked before it was revoked.
2. Zip the handler: `zip function.zip index.mjs`
3. AWS Console → Lambda → Create function
   - Runtime: Node.js 22.x
   - Architecture: x86_64
4. Upload `function.zip` as the code source
5. Configuration → Function URL → Create function URL
   - Auth type: NONE
   - Don't turn on the function URL's CORS setting. The handler sends its own CORS headers.
6. Configuration → Environment variables → add:
   - `ADMIN_KEY`: the admin password. Make it long, not a PIN:
     `node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"`
     The function URL is open to anyone, so this password is the only thing
     protecting the contributor list. With it unset, every admin request is refused.
     **Use the same value as the config Lambda's `ADMIN_KEY`.** The admin page signs
     in once and sends that password to both functions. If the two differ, the
     modules still load, but Voice contributors says the password wasn't accepted.
   - `BUCKET`: the bucket name
   - `ALLOW_LOCALHOST`: set to `true` only on a function used for local development.
     Leave it off in production, so only the live site is allowed as an origin.
7. Configuration → Permissions → add inline policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::cafefluent-recordings/contributors.json"
       },
       {
         "Effect": "Allow",
         "Action": "s3:PutObject",
         "Resource": "arn:aws:s3:::cafefluent-recordings/*"
       },
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::cafefluent-recordings"
       }
     ]
   }
   ```
   `contributors.json` is the only object the function reads, so that is the only
   object it can read. Clips are listed, never read back.

The default 3-second timeout is enough. Each clip is one small request.

## Bucket layout

```
contributors.json                         every contributor, with a hash of their token
consent/<id>.json                         written when a contributor agrees to record
clips/<id>/<module>/<item>_<variant>.wav  one recording, replaced if re-recorded
```

`contributors.json` is created when the first contributor is added. Only the
admin routes write it, and they write conditionally: S3 refuses the write if the
file changed since it was read, and the handler starts again from the new
version. Without that, an add and a revoke made at the same moment would lose
one of the two, and a lost revoke leaves a link working that was meant to be cut
off. Consent is a separate object, so a contributor never writes to the same
file as the admin.

## Routes

The admin routes need the `x-admin-key` header. A wrong or missing password gets a 401.

- **GET `/contributors`**: returns `{ contributors: [{ id, name, created, revoked, consented, clips }] }`. `clips` is how many they have recorded. No token or hash is ever returned.
- **POST `/contributors`** with `{ name }`: adds a contributor and returns `{ contributor, token }` (201). The name must be 1 to 60 characters. **The token is shown only here.** Only its hash is stored, so a lost link cannot be looked up and has to be replaced by adding the person again.
- **DELETE `/contributors/:id`**: revokes their link. Their clips are kept. Revoking twice is not an error.

Contributor routes need the `x-contributor-token` header from their link. An unknown or revoked token gets a 401.

- **GET `/me`**: returns `{ id, name, consented, clips: [{ module, file }] }`, so a recorder page can resume on any device.
- **POST `/me/consent`**: records that they agree to their voice being recorded and used in the app.
- **PUT `/clips/:module/:file`** with the WAV as the body (`Content-Type: audio/wav`): saves the clip, replacing any earlier take.
  - 403 until they have agreed.
  - 400 unless the module is a lowercase slug, the file is `<item>_<variant>.wav`, and the body starts with a RIFF/WAVE header.
  - 413 if the clip is over 2 MB.
  - 403 once they hold 600 clips. Re-recording an existing take is always allowed; only a new one counts towards the limit. The whole curriculum is around 200 clips a contributor, so reaching the limit means something has gone wrong.

## Security

The token in the link is the only thing a contributor needs, so treat links like
passwords: send each one only to its contributor. A leaked link can only add or
replace clips in that contributor's own folder, and revoking it stops that.
Everything is checked before a clip is saved.

Only hashes of the tokens are stored, so a copy of `contributors.json` is not a
set of working links. Both the admin password and the contributor tokens are
compared in constant time, and the comparison fails closed when no password is
configured.

Clips and the consent records that go with them are personal data. Revoking a
link deliberately keeps the clips, and the policy above grants no
`s3:DeleteObject`, so clips can only be removed from the console. Decide how long
to keep them before the first real recording session.

## Logging

Every request writes one JSON line to CloudWatch Logs. The line never includes a token:

```json
{"event":"request","method":"PUT","route":"PUT /clips/:module/:file","status":200,"contributor":"amira-haddad-3f9a1c"}
```

## Tests

`index.test.mjs` tests the handler with S3 replaced by an in-memory fake. The
fake copies ETags and conditional writes, because the admin routes rely on them.
It runs as part of `npm test`.

The contributor page (`record.html`) and the admin page's Voice contributors
section are tested end to end against `e2e/fakeRecordingsApi.ts`, which copies
every route. When you change them, change the fake and `e2e/record.spec.ts` and
`e2e/contributors.spec.ts` to match.

## Deploy order for the contributor page

`record.html` calls this function at `VITE_RECORDINGS_API_URL`, set in the
committed `.env`. **Deploy the function first, then set the URL in `.env` and
deploy the site.** With the URL empty, the page says recording is not open yet,
so the site can safely go out before the function exists. Pointing it at a
function that isn't deployed would make every link report a connection error
instead.
