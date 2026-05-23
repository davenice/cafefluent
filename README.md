# CafeFluent

A self-study PWA quiz app for people learning the language and vocabulary needed to work in a cafe. Designed to accompany an in-person course, with a structured curriculum of modules and quiz types.

Hosted at **cafefluent.dandr.org** via GitHub Pages — fully client-side, no backend required.

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173/
npm run build      # production build to dist/
```

Deployment is automatic: push to `main` and GitHub Actions builds and deploys to GitHub Pages.

## Architecture

React + TypeScript + Vite. Hash-based routing (`/#/module/task`) for GitHub Pages compatibility. `vite-plugin-pwa` for offline support via a service worker.

### Adding a new task type

1. Add the type name to `TaskType` in `src/types/index.ts`
2. Create a component in `src/components/quiz/` — it receives `items`, `imageBase`, and `onComplete(score, total)`
3. Register it in `QuizShell.tsx` (currently dispatches on `task.type === 'image-match'`)
4. Add the task entry to the module in `src/data/modules.ts`

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
| 1 | Match allergen name + description → image (multiple choice) | **Done** |
| 2 | Hear the word spoken → choose the written word | Planned |
| 3 | Hear a sentence ("I'm allergic to…") → choose the correct image | Planned |

Task 3 will vary the phrasing: *I'm allergic to / I'm intolerant to / I must not eat / I can't eat / I have an allergy to.*

Tasks 2 and 3 require audio files — format, hosting and naming convention to be decided.

### Future modules

Further topics following the course curriculum — to be defined as the course develops.

---

## Project structure

```
public/
  content/
    allergens/
      data.json         ← names, descriptions, image filenames
      images/           ← one image per allergen

src/
  data/modules.ts       ← module registry (add new modules here)
  types/index.ts        ← shared TypeScript types
  components/
    HomePage.tsx        ← module list
    ModulePage.tsx      ← task list for a module
    quiz/
      QuizShell.tsx     ← loads data, manages quiz lifecycle
      ImageMatch.tsx    ← Task 1 question type
  hooks/useProgress.ts  ← localStorage read/write
  utils/shuffle.ts      ← Fisher-Yates shuffle

.github/workflows/
  deploy.yml            ← build + deploy to GitHub Pages on push to main
```
