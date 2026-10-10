# CafeFluent

Quiz app for ESOL learners training to work in a cafe. See README.md for architecture, content layout and the curriculum plan.

## Writing learner-facing text

All text a learner sees or hears (item names, descriptions, module intros, sentence audio) must be at **CEFR B1 level**: short sentences, one idea each, everyday vocabulary. Avoid rare descriptive words; keep useful cafe vocabulary (flaky, savoury, sponge, puff pastry). Details in README.md under "Adding content".

## Tests

`npm test` runs the unit and component tests (Vitest), including the config Lambda's in `lambda/index.test.mjs` and the content check in `scripts/content.test.ts`. `npm run test:e2e` runs the Playwright tests in `e2e/` against a production build. Details in README.md under "Testing".

When adding or changing a quiz type, keep the tests in step: the files it loads go in `expectedFiles` in `scripts/content.test.ts`, and how to find its right answer goes in `correctAnswer` in `e2e/helpers/quiz.ts`. The e2e tests pick up new modules and tasks from `src/data/modules.ts` by themselves.

## Changing the config Lambda

The e2e tests never call the real Lambda. `e2e/fakeConfigApi.ts` answers in its place and copies the contract of `lambda/index.mjs`: the methods, the PIN check, the request and response bodies, and the status codes. **If you change the Lambda, update the fake and the e2e tests (`e2e/enablement.spec.ts`) to match in the same change**, as well as `lambda/index.test.mjs`. Otherwise the e2e tests keep passing against the old behaviour, and a mismatch between the app and the Lambda will not be caught.
