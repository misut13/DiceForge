# CLAUDE.md

Guidance for Claude Code and other coding agents working in this repository.
`AGENTS.md` is a generated copy of this file: never edit it by hand, run `cp CLAUDE.md AGENTS.md` after every change here.

## What this is

DiceForge is a pen-and-paper dice roller for the phone (German UI). Players create character profiles with
attack functions (attack + damage roll), dice functions (`3w6+3`) and simple dice, then tap to roll.

- Live: https://misut13.github.io/DiceForge/ (GitHub Pages, deployed by the CI workflow after the tests pass)
- Tag `original`: the GPT/Codex version before the 2026-10 restructuring

## Commands

```sh
npm install          # dev tools only (Playwright), the app itself has no dependencies
npm test             # unit tests (node:test) for model.js, runs in well under a second
npm run test:e2e     # Playwright: phone (Chromium), iPhone (WebKit), laptop (Chromium)
npm run serve        # http://localhost:8000, ES modules do not work over file://
npx playwright install chromium webkit   # once, before the first e2e run
```

CI (`.github/workflows/ci.yml`) runs both suites on every push and pull request. On `main` it then deploys to
GitHub Pages: only the app files (`index.html`, `*.js` without tests, `styles.css`, `img/`, `sounds/`) and with
`?v=dev` replaced by the commit hash.

## Architecture

| File | Role |
|---|---|
| `model.js` | Pure logic, no DOM: formula parsing, rolling, profile normalization and merging |
| `model.test.js` | Unit tests for `model.js` |
| `app.js` | UI: rendering, navigation, storage, dialogs, sounds, animation |
| `index.html` | All screens as static markup (`.screen` sections, forms, two `<dialog>`s) |
| `styles.css` | Layout and theme, frames via `border-image` |
| `e2e/app.spec.js` | End-to-end tests of every user flow |
| `img/`, `sounds/` | WebP images and AAC (`.m4a`) sounds |

- **Navigation is history-driven.** Every screen and the result popup is a `history` entry
  `{ view, profileId, form, index, result, depth }`; `render(state)` draws the whole UI from it. Never show a
  screen without going through `navigate()`/`goBack()`, otherwise the browser and Android back button break.
- **Storage** lives in `localStorage` under `profiles` and `appSettings`. Loaded data and import files go through
  `normalizeProfiles()`.
- **Rendering** builds DOM nodes with the `el()` helper and `textContent`.
- **Cache busting:** every local script, stylesheet and module import is referenced with `?v=dev`
  (`assets.test.js` enforces it). GitHub Pages caches files for 10 minutes; without the version stamp a new
  `index.html` can run with an old `app.js`. A new JS module must also be added to the deploy step's file list.

## Test-driven development (mandatory)

**Iron law: no production code without a failing test first.** This applies to features, bug fixes, refactorings
and behavior changes. Exceptions only with explicit permission from the user (throwaway prototypes, pure styling).

1. **RED:** write one minimal test for one behavior with a clear name. Run it and watch it fail *for the
   expected reason* (the behavior is missing, not a typo or import error). If it errors, fix the error and rerun
   until it fails correctly. If it passes immediately, it tests existing behavior: fix the test.
2. **GREEN:** write the simplest code that makes it pass. No extra options, no "while I'm here".
3. **REFACTOR:** only on green. Remove duplication, improve names. Stay green.
4. **Whole suite before done:** `npm test` and `npm run test:e2e`, not just the file you touched. Report every
   failure by name, including ones you did not cause.

Where a test belongs:

- Logic (formulas, rolling, data handling) goes into `model.js` and is tested in `model.test.js`. If logic in
  `app.js` needs a test, move it into `model.js` first (test first, then move).
- User-visible behavior (screens, dialogs, back button, export/import, persistence) is tested in `e2e/app.spec.js`.
- Bug fix: first a test that reproduces the bug and fails, then the fix.
- Randomness: pass a random source (`rollFormula(formula, random)`) in unit tests; e2e tests stub `Math.random`.
  Never assert on unseeded random results.

Test quality:

- One behavior per test; an "and" in the name means split it.
- Before writing a test, name the code change that would make it fail. Tests written after the code (for
  example to cover existing code) must be proven by a mutation: break the code briefly, see the test go red,
  restore. A mutation no test catches means either a missing test or dead code; delete dead code.
  Restore mutations from a copy of the file, never with `git checkout`: that also discards uncommitted work.
- Use real code, no mocks unless unavoidable. Assert on behavior, not implementation details.
- E2E tests are independent: each seeds its own `localStorage` and uses web-first assertions
  (`await expect(locator)…`) instead of fixed timeouts.

## Quality rules

**Simplicity**
- No runtime dependencies, no build step, no framework. Vanilla JS ES modules, plain CSS.
- Platform first: `<dialog>`, form validation (`required`, `pattern`, `setCustomValidity`), CSS layout and
  `border-image` before custom JS. Shortest diff that solves the root cause; no speculative options.

**Users' data is sacred**
- `localStorage` keys and the profile shape stay backward compatible. Data from the `original` tag must keep
  loading (covered by tests). A format change needs a migration in `normalizeProfiles()` plus a test.
- Never drop data silently: invalid stored formulas are kept and reported on roll.
- The export format is `{ app: 'DiceForge', version, profiles }`. Bump `version` on format changes and keep
  importing older versions and the plain array.
- Destructive actions offer undo (toast), no confirm dialogs.

**Security**
- Never put user text into `innerHTML`. Use `el()` / `textContent`. Import files are untrusted input and pass
  through `normalizeProfiles()`.

**UI and accessibility**
- Phone first, but every change must look right on phone (390 px), tablet (820 px) and laptop (1440 px). Check
  screenshots of all three before calling a UI change done.
- Interactive elements are real `<button>`s with labels (`aria-label` for icon-only ones), keyboard reachable,
  visible `:focus-visible`. Respect `prefers-reduced-motion`.
- UI text is German (Swiss spelling: "ss", not "ß"); code, identifiers, comments and commits are English.
- Frame images use `border-image`: slice values are in source image pixels and the rendered border widths must
  keep the image's aspect ratio (scale = rendered height / image height), otherwise icons get distorted.

**Assets**
- Images as WebP, sounds as AAC `.m4a`, animation as animated WebP. Keep the whole app under ~1 MB.
- Delete files that are no longer referenced.

## Definition of done

- [ ] Test written first and seen failing for the right reason
- [ ] `npm test` and `npm run test:e2e` green, output free of errors and warnings
- [ ] UI changes checked at phone, tablet and laptop size
- [ ] `README.md` updated for user-visible changes (README is for humans, this file for agents)
- [ ] After changing this file: `cp CLAUDE.md AGENTS.md`
- [ ] After pushing to `main`: wait for the CI run (tests and deploy) and check https://misut13.github.io/DiceForge/
