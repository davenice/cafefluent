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
2. Zip the handler: `zip function.zip index.mjs`
3. AWS Console → Lambda → Create function
   - Runtime: Node.js 22.x
   - Architecture: x86_64
4. Upload `function.zip` as the code source
5. Configuration → Function URL → Create function URL
   - Auth type: NONE
   - Don't turn on the function URL's CORS setting. The handler sends its own CORS headers.
6. Configuration → Environment variables → add:
   - `ADMIN_PIN`: the same PIN as the config Lambda
   - `BUCKET`: the bucket name
7. Configuration → Permissions → add inline policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject"],
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

The default 3-second timeout is enough. Each clip is one small request.

## Bucket layout

```
contributors.json                         every contributor, with their token
consent/<id>.json                         written when a contributor agrees to record
clips/<id>/<module>/<item>_<variant>.wav  one recording, replaced if re-recorded
```

`contributors.json` is created when the first contributor is added. Only the
admin routes write it. Consent is a separate object, so a contributor never
writes to the same file as the admin.

## Routes

The admin routes need the `x-admin-pin` header. A wrong PIN gets a 401 after 2 seconds.

- **GET `/contributors`**: returns `{ contributors: [{ id, name, token, created, revoked, consented, clips }] }`. `clips` is how many they have recorded.
- **POST `/contributors`** with `{ name }`: adds a contributor and returns `{ contributor }` (201). The name must be 1 to 60 characters. The admin page builds the link from `contributor.token`.
- **DELETE `/contributors/:id`**: revokes their link. Their clips are kept.

Contributor routes need the `x-contributor-token` header from their link. An unknown or revoked token gets a 401.

- **GET `/me`**: returns `{ id, name, consented, clips: [{ module, file }] }`, so a recorder page can resume on any device.
- **POST `/me/consent`**: records that they agree to their voice being recorded and used in the app.
- **PUT `/clips/:module/:file`** with the WAV as the body (`Content-Type: audio/wav`): saves the clip, replacing any earlier take.
  - 403 until they have agreed.
  - 400 unless the module is a lowercase slug, the file is `<item>_<variant>.wav`, and the body starts with a RIFF/WAVE header.
  - 413 if the clip is over 2 MB.

## Security

The token in the link is the only thing a contributor needs, so treat links like
passwords: send each one only to its contributor. A leaked link can only add or
replace clips in that contributor's own folder, and revoking it stops that.
Everything is checked before a clip is saved.

## Logging

Every request writes one JSON line to CloudWatch Logs. The line never includes a token:

```json
{"event":"request","method":"PUT","route":"PUT /clips/:module/:file","status":200,"contributor":"amira-haddad-3f9a1c"}
```

## Tests

`index.test.mjs` tests the handler with S3 replaced by an in-memory fake. It runs as part of `npm test`.
