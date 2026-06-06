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
```

Deployment is automatic: push to `main` and GitHub Actions builds and deploys to GitHub Pages. Tests and build are verified on every pull request.

## Architecture

React + TypeScript + Vite. Hash-based routing (`/#/module/task`) for GitHub Pages compatibility. `vite-plugin-pwa` for offline support via a service worker.

### Adding a new task type

1. Add the type name to `TaskType` in `src/types/index.ts`
2. Create a component in `src/components/quiz/` — quiz types receive `items`, `imageBase`, and `onComplete(score, total)`; study types (like `revision`) receive `items`, `imageBase`, and `onDone`
3. Register it in `QuizShell.tsx` (dispatches on `task.type`)
4. Add the task entry to the module in `src/data/modules.ts`

### Deploying changes

After any code or content change, update the PWA version so returning users get the new content:

```json
// public/manifest.json  →  bump "version" (e.g. "1.0.0" → "1.1.0")
```

The service worker caches aggressively; without a version bump, users may see stale content until they manually clear the cache.

### Adding content

**Module data** lives entirely in `public/content/`. No code changes needed to update text or swap images.

- Add a new module: create `public/content/<module>/data.json` and `public/content/<module>/images/`, then register it in `src/data/modules.ts`.
- Edit allergen descriptions: edit `public/content/allergens/data.json` directly.
- Swap an image: replace the file in `public/content/allergens/images/` — filename must match the `image` field in `data.json`.

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

src/
  data/modules.ts       ← module registry (add new modules here)
  types/index.ts        ← shared TypeScript types
  components/
    HomePage.tsx        ← module list
    ModulePage.tsx      ← task list for a module
    quiz/
      QuizShell.tsx         ← loads data, manages quiz lifecycle
      RevisionTask.tsx      ← study guide task type (browse items with images/descriptions)
      ImageMatch.tsx        ← match name → image
      AudioMatch.tsx        ← hear word → choose written name
      SentenceMatch.tsx     ← hear sentence → choose correct image
      ProductMatch.tsx      ← match product image → product name
      DiagramLabel.tsx      ← label hotspots on a diagram
      questionBuilders.ts   ← pure question-building logic (shared, tested)
  hooks/useProgress.ts  ← localStorage read/write
  utils/shuffle.ts      ← Fisher-Yates shuffle

.github/workflows/
  deploy.yml            ← build + deploy to GitHub Pages on push to main
  ci.yml                ← run tests + build on pull requests
```
