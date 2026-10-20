# CafeFluent

A self-study PWA quiz app for people learning the language and vocabulary needed to work in a cafe. Designed to accompany an in-person course, with a structured curriculum of modules and quiz types.

Hosted at **cafefluent.dandr.org** via GitHub Pages — fully client-side, no backend required.

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173/
npm run build      # production build to dist/
npm test           # run unit and component tests
npm run test:watch # tests in watch mode
npm run test:e2e   # run end-to-end tests in real browsers
npm run check:content # check every image and audio file the quizzes use exists
npm run fetch:recordings # download contributors' voice clips into recordings/
npm run review:recordings # listen to the audio options for each phrase (local only)
```

Deployment is automatic: push to `main` and GitHub Actions builds and deploys to GitHub Pages. Tests and build are verified on every pull request.

## Architecture

React + TypeScript + Vite. Hash-based routing (`/#/module/task`) for GitHub Pages compatibility. `vite-plugin-pwa` for offline support via a service worker.

### Adding a new task type

1. Add the type name to `TaskType` in `src/types/index.ts`
2. Create a component in `src/components/quiz/` — quiz types receive `items`, `imageBase`, and `onComplete(score, total)`; study types (like `revision`) receive `items`, `imageBase`, and `onDone`
3. Register it in `QuizShell.tsx` (dispatches on `task.type`)
4. Add the task entry to the module in `src/data/modules.ts`
5. Teach the tests about it: list the files it needs in `expectedFiles` in `scripts/content.test.ts`, and add a way to find the right answer in `correctAnswer` in `e2e/helpers/quiz.ts`

### Deploying changes

No manual version bump is needed. Every build regenerates `sw.js` with fresh precache
revision hashes, which is what tells the browser a new version exists.

Returning users are handled by `UpdatePrompt.tsx`: when the service worker finds a new
build it shows a "A new version is ready" bar with Reload and Later buttons. Reload activates the
new worker and reloads; Later hides the bar for this session. Fully closing the app also
applies the update, since the browser activates a waiting worker once no page is using the
old one, so the prompt only matters for an app that stays open. The bar is never shown
mid-task, since quiz progress is only saved on completion. It checks for updates on load, hourly, and whenever the app returns to
the foreground — the last of these is what catches a PWA resumed from the home screen,
since browsers only check about once a day on their own.

The build stamp in the bottom-right corner shows the commit a device is actually running,
which is the quickest way to confirm an update landed.

### Testing

There are two kinds of tests. Both run on every pull request.

**Unit and component tests** (Vitest, `npm test`) sit next to the code in `src/`, as `*.test.ts(x)`. Components are tested in jsdom with Testing Library. The config Lambda has its own tests in `lambda/index.test.mjs`, with Parameter Store replaced by an in-memory fake. The recordings Lambda's are in `lambda-recordings/index.test.mjs`, with S3 replaced the same way.

**Content check** (`scripts/content.test.ts`, part of `npm test`, or alone with `npm run check:content`) works out every file each module's tasks will ask for and fails if any is missing, naming the file and the task that needs it. It covers item, product and diagram images, image legends, and the audio for each item, sentence variant and hotspot. It also checks each task has enough content to ask a question.

**End-to-end tests** (Playwright, `npm run test:e2e`) are in `e2e/`. They build the app with `vite build --mode e2e` into `dist-e2e/`, serve it with `vite preview`, and drive it in Chromium and WebKit at phone size. Use these for what component tests can't see: routing, saved progress, module enablement, and the service worker. `npm run test:e2e:ui` opens Playwright's UI for stepping through a test. The first time, install the browsers with `npx playwright install chromium webkit`.

The e2e build points `VITE_MODULES_API_URL` at `https://modules.test/` (see `.env.e2e`). That domain never resolves, so the tests can't reach the real Lambda. Instead, `e2e/fakeConfigApi.ts` answers those requests inside the browser. It keeps the config in memory, accepts the admin password from `TEST_ADMIN_KEY`, and can be switched to return errors or drop the connection. It copies the Lambda's contract, so **when you change `lambda/index.mjs`, change the fake and the e2e tests to match**. `e2e/fakeRecordingsApi.ts` does the same for the recordings Lambda, at `https://recordings.test/`.

| File | Covers |
|---|---|
| `tasks.spec.ts` | Every task in every module opens, and all its images load |
| `quizzes.spec.ts` | One task of each quiz type answered to a perfect score, saved and kept after a reload; a worse result replacing the saved one; right and wrong answer feedback |
| `audio.spec.ts` | Every task with audio asks for a sound file that exists and matches an answer on screen; the replay button |
| `navigation.spec.ts` | Back buttons, the browser's back button, deep links, unknown modules and tasks |
| `learner.spec.ts` | A study guide marked complete is remembered |
| `enablement.spec.ts` | Module enablement on the home and admin pages |
| `offline.spec.ts` | The last known module config is used offline |
| `contributors.spec.ts` | The admin page's Voice contributors section: listing, adding and the one-time link, copying it, stopping a link, and the recordings server failing or rejecting the password |
| `record.spec.ts` | The contributor page: bad and missing links, consent, and (Chromium only, with a fake microphone) clips sent as recorded, kept while offline, sent on the next visit, and a link revoked mid-session; the service worker leaving `record.html` alone |

Most tests import `test` from `e2e/fixtures.ts` rather than from Playwright. It installs the fake config API with every module enabled, and records every `new Audio(src)` the page makes, since headless browsers may never play the sound. The quiz tests answer from the module's `data.json`: `e2e/helpers/quiz.ts` works out the right answer from what is on screen, or from the audio file just asked for. They pause the page's clock (`pauseClock`) and move it on past the pause after each answer, so a 14-question quiz takes well under a second.

Service workers are blocked by default in the e2e tests, because Playwright can't intercept a service worker's own requests in WebKit. `e2e/offline.spec.ts` turns the worker back on, and so only runs in Chromium.

To run the tests while `npm run test:e2e:ui` is already open, give the second run its own port: `E2E_PORT=4175 npm run test:e2e`.

When a test fails in CI, the HTML report with a trace of the failure is uploaded as the `playwright-report` artifact. Locally, open a trace with `npx playwright show-trace test-results/<test>/trace.zip`.

### Adding content

**Module data** lives entirely in `public/content/`. No code changes needed to update text or swap images.

- Add a new module: create `public/content/<module>/data.json` and `public/content/<module>/images/`, then register it in `src/data/modules.ts`.
- Edit allergen descriptions: edit `public/content/allergens/data.json` directly.
- Swap an image: replace the file in `public/content/allergens/images/` — filename must match the `image` field in `data.json`.

**Language level.** The app is aimed at ESOL learners, so all learner-facing text (item names, descriptions, module intros, sentence audio) should be written at **CEFR B1 level**: short sentences with one idea each, everyday vocabulary, and no rare descriptive words (e.g. *crimped*, *domed*, *tangy*, *dusted*). Useful cafe vocabulary such as *flaky*, *savoury*, *sponge* or *puff pastry* is fine, since learning those words is the point. If a word is unusual and the picture does the work, leave it out.

Progress is stored per-task in `localStorage` — no account or server needed.

---

## Curriculum plan

### Module 1: Allergens

The 14 major food allergens (EU/UK regulation).

| Task | Type | Status |
|---|---|---|
| 0 | Study guide — browse all allergens with images and descriptions | **Done** |
| 1 | Match allergen name + description → image (multiple choice) | **Done** |
| 2 | Hear the word spoken → choose the written word | **Done** |
| 3 | Hear a sentence ("I'm allergic to…") → choose the correct image | **Done** |

Task 3 varies the phrasing: *I'm allergic to / I'm intolerant to / I must not eat / I can't eat / I have an allergy to.*

Audio files are pre-generated offline and committed to `public/content/<module>/audio/`. See [Generating audio](#generating-audio) below.

### Future modules

Further topics following the course curriculum — to be defined as the course develops.

### Table game: Describe it

A describe-the-word game for a table sharing one phone (`/#/describe-it`, code in
`src/game/` and `src/components/DescribeGamePage.tsx`). It is switched on and off on the
admin page like a module, but listed separately under "Table games".

The course leader sets the words, the seconds per turn and the number of turns on the
admin page. These are stored in the `/cafefluent/game-settings` SSM parameter (see
[lambda/README.md](lambda/README.md)). Players add their names, and the turns are shared out
between them in order. Each word is "Got it" (1 point) or "Skip" (0). Skipped words come
round again when the words run out. The score is words guessed per turn, so tables of
different sizes can be compared. The results list the skipped words for the class to go over.

The game in progress is saved in `localStorage` after every tap, so it survives a reload.

---

## Generating audio

Audio clips are generated once using AWS Polly and committed alongside the content. The app serves them as static files — no API calls at runtime.

### Setup

AWS credentials must be available (either `~/.aws/credentials` or environment variables) and `AWS_REGION` must be set:

```bash
export AWS_REGION=eu-west-1
```

### Running the generator

```bash
# Generate missing clips for all modules
npm run generate:audio

# One module only
npm run generate:audio -- --module=allergens

# Force-regenerate everything (e.g. after changing voice settings)
npm run generate:audio -- --force
```

The script skips any file that already exists, so re-running is safe and only produces new clips.

### Output

For each item in `data.json`, the script writes:

```
public/content/<module>/audio/<id>_<variant>.mp3
public/content/<module>/audio/manifest.json
```

`manifest.json` records every generated clip — its item id, variant name, the exact text that was synthesised, and the filename. The app reads this to know what audio is available.

Modules with diagrams (e.g. Barista equipment) also get one `<hotspotId>_name.mp3` per hotspot, spoken from the hotspot's `label`. Add an `audioName` to a hotspot to override the spoken text.

### Voice settings

Configured at the top of [scripts/generate-audio.mjs](scripts/generate-audio.mjs):

| Setting | Value | Notes |
|---|---|---|
| Voice | Amy | British English female |
| Engine | standard | Lower cost; neural is higher quality |
| Sample rate | 8 kHz | Telephone quality — keeps file sizes small |

### Adding sentence variants (Task 3)

Add entries to the `VARIANTS` object in the script:

```js
allergic:    (name) => `I'm allergic to ${name}`,
intolerant:  (name) => `I'm intolerant to ${name}`,
'must-not-eat': (name) => `I must not eat ${name}`,
```

Re-running will generate only the new variants; existing files are untouched.

Each allergen only uses some of the sentences, so learners hear a mix without every
sentence being recorded for every allergen. An item's `variants` in `data.json` lists the
clips it gets, overriding the module's list. The generator, the sentence quiz and the voice
recorder all follow it:

```json
{ "id": "milk", "variants": ["name", "allergic", "intolerant", "cant-have"], ... }
```

The generator doesn't delete clips. If you take a variant away, delete its mp3 and manifest entry.

### Overriding the spoken name

If an allergen name contains characters that synthesise poorly (e.g. `Sulphites/Sulphur Dioxide`), add an `audioName` field to the item in `data.json`:

```json
{
  "id": "sulphites",
  "name": "Sulphites/Sulphur Dioxide",
  "audioName": "Sulphites and Sulphur Dioxide",
  ...
}
```

If the voice mispronounces a word outright (foreign names such as *pain au chocolat*), add an `audioSsml`
field instead: an SSML fragment that replaces the name wherever it is spoken, typically a
`<phoneme>` tag giving the pronunciation in IPA. The request is then sent to Polly as SSML.

```json
{
  "id": "pain-au-chocolat",
  "name": "Pain au chocolat",
  "audioSsml": "<phoneme alphabet=\"ipa\" ph=\"pæn əʊ ˈʃɒkəlɑː\">pain au chocolat</phoneme>",
  ...
}
```

---

## Recording real voices

Contributors record every clip in their own voice from a personal link,
`https://cafefluent.dandr.org/record.html?t=<token>`. The admin page's "Voice contributors"
section adds someone and shows their link once (only a hash of the token is kept, so a lost
link is replaced by stopping it and adding them again). It also lists how many clips each
person has recorded, and stops a link. They read each phrase on screen; two
seconds of silence saves the clip and shows the next one. Each clip is sent straight to S3
by the recordings Lambda ([lambda-recordings/README.md](lambda-recordings/README.md)), so
there is nothing for them to send us.

- A 3-second room check stops if the background is louder than the quiet limit (−35 dBFS
  by default; set in Settings as "35", since phone number pads have no minus key), and
  recording pauses if the room gets noisy. "Record anyway" carries on in a room that failed
  the check, with the limit moved 6 dB above its background.
- The first visit asks the contributor to agree to their voice being used. Nothing is
  saved on the server until they do.
- Phrases no one has recorded yet come first, then ones with one recording, and so on, from
  counts the recordings Lambda keeps across all contributors (refreshed each time Start is
  pressed). Within each count the order is a shuffle seeded by the contributor's id, so two
  people recording at once get different phrases. Opening the link again carries on, on any
  device: clips already on the server count as done.
- The review screen lists the recorded phrases first, then the ones still to do.
- Clips are 22,050 Hz WAVs, about 10 MB for a full set. Each is saved in the browser
  (IndexedDB) first, which works as an outbox: a clip that can't be sent (no connection,
  page closed) is retried, and sent on the next visit at the latest. Leaving the page with
  clips unsent asks for confirmation.
- Every clip is saved at a standard level, so one contributor's recordings don't play back
  far quieter than another's in the same quiz. The gain puts the level of all but the
  loudest 1% of samples at −8 dBFS, measured that way rather than by the peak so one lip
  smack can't set it, and is applied to the floats before the 16-bit conversion, so lifting
  a quiet recording costs nothing. Microphones differ by more than 30 dB: a phone that hands
  over unprocessed audio — which is what asking for no echo cancellation, noise suppression
  or automatic gain gets, and what the room check needs — can come in 35–40 dB below another
  device reading the same words. The level the microphone gave is kept with the clip, so the
  review screen can say "Microphone very quiet", which it does only when even the largest
  gain allowed (45 dB) can't bring the clip up to level.
- Speech is detected relative to the measured background, never at a fixed level, for the
  same reason. The floor limit (−90 dBFS, which stops a silent input putting the threshold
  under someone's breathing) has to stay below what such a microphone measures in a quiet
  room, near −100 dBFS: above it, the limit rather than the room sets the threshold, and
  quiet words land underneath it and are never heard.
- Space pauses. Backspace records the last phrase again. The review screen plays back every
  clip recorded on this device.
- "Finish for now" stops recording and lets go of the microphone. It shows how many phrases
  are done, and tells the contributor to open their link again to carry on.
- Recording pauses while the page is in the background, and starts the microphone again on
  Resume. Leaving the page stops the audio: the browser suspends the audio context, and the
  device may give the microphone to another app (a call, the assistant). Nothing tells the
  page, and a stopped microphone looks exactly like a quiet room — the level meter holds its
  last value and no clip is ever saved — so the page watches `Mic.isLive()` while recording
  and says that the microphone stopped. Resuming opens a new stream on the same audio
  context, from the tap, since both resuming audio and `getUserMedia` can need a gesture.

`record.html` is a separate entry point (`src/record/main.tsx`), not part of the app. The
service worker neither caches it nor answers for it, so a link opened on a learner's
device shows the recorder, not the app.

The microphone needs https or localhost. To test locally, point `VITE_RECORDINGS_API_URL`
in `.env.local` at a recordings function with `ALLOW_LOCALHOST=true`, and open
`http://localhost:5173/record.html?t=<token>`.
Code is in `src/recorder/`, `src/components/RecordPage.tsx` and `src/components/ContributorPage.tsx`.

### Fetching the recordings

```bash
export AWS_REGION=eu-west-1   # the bucket's region
npm run fetch:recordings
```

This copies every clip from the bucket into `recordings/<contributor-id>/<module>/<item>_<variant>.wav`
(git-ignored). Re-running only downloads new clips and ones recorded again since the last fetch,
and never deletes anything locally. The bucket defaults to `cafefluent-recordings`; set
`RECORDINGS_BUCKET` or pass `--bucket=<name>` for another. Your AWS credentials need
`s3:ListBucket` and `s3:GetObject` on the bucket. Code and tests are in
`scripts/fetch-recordings.mjs` and `scripts/fetch-recordings.test.mjs`.

### Reviewing the recordings

```bash
npm run review:recordings   # dev server, opening http://localhost:5173/review.html
```

A local page listing every phrase the app speaks with its audio options side by side: the
generated Polly clip the app plays today, and each contributor's recording of it from
`recordings/`. Play one, or **Play all** to hear them one after another. Filter by module,
and by recorded, not recorded, or worth a listen.

Each recording shows its length, peak and average level, and any silence before or after the
words, and is flagged if it is quiet, may be clipped, or is long for the number of words
(`clipWarnings` in `src/recorder/script.ts`, the same check the contributor's own review
screen uses). The generated clips are not measured: they come out of Polly at a consistent
level, so there is nothing to compare between them.

Levels are shown to tell you how the voices compare, not to decide anything in the page.
Nothing here changes a file: evening out loudness and trimming silence belong to the step
that turns a recording into the mp3 the app plays, which doesn't exist yet.

It is local only, and only works under the dev server, which measures and serves the clips
(`scripts/reviewRecordings.ts`). `review.html` is not in the production build and
`recordings/` is git-ignored, so neither is ever deployed. Run `npm run fetch:recordings`
first, and again to pick up new clips.

Contributors appear under the id that names their folder in `recordings/`, which is their
name plus six characters (`dave-n-db6f0b`).

---

## Project structure

```
public/
  content/
    allergens/
      data.json         ← names, descriptions, image filenames, optional audioName overrides
      images/           ← one image per allergen
      audio/            ← generated MP3s + manifest.json (run npm run generate:audio)

scripts/
  generate-audio.mjs    ← AWS Polly TTS generator (offline, run manually)
  fetch-recordings.mjs  ← download contributors' clips from S3 into recordings/
  reviewRecordings.ts   ← dev-server side of review.html: measures and serves recordings/

src/
  data/modules.ts       ← module registry (add new modules here)
  types/index.ts        ← shared TypeScript types
  components/
    HomePage.tsx        ← module list
    UpdatePrompt.tsx    ← "new version ready" reload bar (service worker updates)
    ModulePage.tsx      ← task list for a module
    quiz/
      QuizShell.tsx         ← loads data, manages quiz lifecycle
      RevisionTask.tsx      ← study guide task type (browse items with images/descriptions)
      ImageMatch.tsx        ← match name → image
      AudioMatch.tsx        ← hear word → choose written name
      SentenceMatch.tsx     ← hear sentence → choose correct image
      ProductMatch.tsx      ← match product image → product name
      DiagramLabel.tsx      ← label hotspots on a diagram
      DiagramAudio.tsx      ← hear a part name → tap it on the diagram
      questionBuilders.ts   ← pure question-building logic (shared, tested)
  review/               ← review.html: the audio options for each phrase (dev only)
  hooks/useProgress.ts  ← localStorage read/write
  utils/shuffle.ts      ← Fisher-Yates shuffle

.github/workflows/
  deploy.yml            ← build + deploy to GitHub Pages on push to main
  ci.yml                ← run tests + build on pull requests
```
