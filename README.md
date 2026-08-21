# Automation Testing Assessment

End-to-end UI test suite for the [OrangeHRM public demo](https://opensource-demo.orangehrmlive.com), built with [Playwright](https://playwright.dev/) (TypeScript). Test results can be viewed via Playwright's built-in HTML report or as an [Allure](https://allurereport.org/) report.

## Prerequisites

- **Node.js** 20+ and npm
- **Java 8+** (only needed to generate/open the Allure report — the `allure` CLI runs on the JVM)

## Install

```bash
npm install
npx playwright install --with-deps chromium firefox webkit
```

`npx playwright install` downloads the browser binaries Playwright drives (Chromium, Firefox, WebKit). `--with-deps` also installs the OS-level libraries those browsers need (Linux only; safe to omit on macOS/Windows).

## Running the tests

```bash
npm test                    # full suite, all browsers (chromium, firefox, webkit)
npx playwright test --project=chromium   # single browser only (fastest for local runs)

npm run test:positive       # only @positive-tagged scenarios
npm run test:negative       # only @negative-tagged scenarios
npm run test:functional     # only @functional-tagged scenarios
npm run test:validation     # only @validation-tagged scenarios

npx playwright test tests/claim.spec.ts   # a single spec file

npx playwright test -g "nama_test_case"               # run a specific test case by (partial) name
npx playwright test -g "User add new assign claim"    # example
```

`-g` matches against the test title (and its `describe` block name), so a partial string works too — e.g. `-g "assign claim"` runs every test whose title contains that phrase.

Tests run against the public OrangeHRM demo site, which is shared and can be slow — each test already has generous timeouts and built-in waits to compensate, so a full run can take 15–20+ minutes. Workers are capped (`2` locally, `1` on CI) in `playwright.config.ts` to avoid overloading the demo instance.

## Test reports

**Live Allure report:** https://allure-report-tawny.vercel.app/#suites/4b0a40b3b1ea406fd5b1e98f00b82549/d97cd1ac3797ec67/

Every run produces two report formats:

**Playwright HTML report** (default `reporter: 'html'`):

```bash
npm run test:report         # opens playwright-report/ in a browser
```

**Allure report** (richer history/trends, generated from `allure-results/`):

```bash
npm run allure:generate     # builds allure-report/ from allure-results/
npm run allure:open         # serves and opens allure-report/ in a browser
```

Run `allure:generate`/`allure:open` only after a test run has produced `allure-results/` — and avoid running any other `playwright test` command (including `--list`) in between, since Playwright reporters (including allure-playwright) write on every invocation and a later `--list` run will overwrite real pass/fail results with "skipped" placeholders.

For a single portable HTML file (handy for sharing without a server):

```bash
npx allure generate allure-results --single-file --clean -o allure-report-single
```

## Project structure

```
tests/
  login.spec.ts         Login flows (positive + negative)
  admin.spec.ts          Admin > User Management, Job (Job Categories, Pay Grades,
                          Employment Status, Job Titles, Work Shifts)
  pim.spec.ts             PIM > Employee, Reports
  leave.spec.ts           Leave > Assign Leave
  recruitment.spec.ts    Recruitment > Candidates, Vacancies
  claim.spec.ts           Claim > Assign Claim
playwright.config.ts    Playwright + reporter configuration
```

Each test is tagged with a combination of `@positive`/`@negative` and `@functional`/`@validation`, e.g.:

```ts
test.describe('Fitur Claim', { tag: ['@positive', '@functional'] }, () => { ... });
```

## Notes

- Base URL and demo login credentials (`Admin` / `admin123`) are the public OrangeHRM demo's own defaults — nothing sensitive is stored in this repo.
- Test data (usernames, employee names, claim remarks, etc.) is randomized per run to avoid collisions with existing demo data and with previous runs.
- `allure-results/`, `allure-report/`, `playwright-report/`, and `test-results/` are generated output and are git-ignored.
