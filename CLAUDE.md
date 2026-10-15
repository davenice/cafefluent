# CafeFluent

Quiz app for ESOL learners training to work in a cafe. See README.md for architecture, content layout and the curriculum plan.

## Writing learner-facing text

All text a learner sees or hears (item names, descriptions, module intros, sentence audio) must be at **CEFR B1 level**: short sentences, one idea each, everyday vocabulary. Avoid rare descriptive words; keep useful cafe vocabulary (flaky, savoury, sponge, puff pastry). Details in README.md under "Adding content".

## Tests

`npm test` runs the unit and component tests (Vitest), including the config Lambda's in `lambda/index.test.mjs` and the content check in `scripts/content.test.ts`. `npm run test:e2e` runs the Playwright tests in `e2e/` against a production build. Details in README.md under "Testing".

When adding or changing a quiz type, keep the tests in step: the files it loads go in `expectedFiles` in `scripts/content.test.ts`, and how to find its right answer goes in `correctAnswer` in `e2e/helpers/quiz.ts`. The e2e tests pick up new modules and tasks from `src/data/modules.ts` by themselves.

## Changing the config Lambda

The e2e tests never call the real Lambda. `e2e/fakeConfigApi.ts` answers in its place and copies the contract of `lambda/index.mjs`: the methods, the sign-in check, the request and response bodies, and the status codes. **If you change the Lambda, update the fake and the e2e tests (`e2e/enablement.spec.ts`) to match in the same change**, as well as `lambda/index.test.mjs`. Otherwise the e2e tests keep passing against the old behaviour, and a mismatch between the app and the Lambda will not be caught.

## Deploying a change that spans a Lambda and the app

The Lambdas and the site deploy separately and by hand, so there is always a
window where one side is new and the other is old. Whenever a change creates a
dependency in either direction, **say in the change which side deploys first and
what breaks if the order is reversed**, and put it in that Lambda's README rather
than only in a pull request.

Make compatibility two-way where it is cheap: the app tolerating an old function
and the function tolerating an old app. Even then the order is not free, because
the browser preflights any request carrying a custom header, and it checks the
function's allowed-headers list before sending anything. **Deploy the function
before the site.** A site that is ahead of its function fails at the preflight, so
the request never leaves the browser and the app reports a connection error that
says nothing about the real cause.

Local development hides this. The dev server proxies `/modules-api` to the live
function, which makes the call same-origin and skips the preflight entirely, so
localhost can work while the deployed site does not. Check a deploy from outside
with an `OPTIONS` probe against the function URL.
