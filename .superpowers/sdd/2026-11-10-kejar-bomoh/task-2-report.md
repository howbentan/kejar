# Task 2 report: QR helpers for Bomoh

**Status:** DONE

## What was implemented

Added three helpers to `app/shared/ids.ts`, directly after `datoQr` / `isDatoQr` / `datoCodeFromQr`, with the same bodies and `DATO` replaced by `BOMOH`:

- `bomohQr(code)` returns `KEJAR:BOMOH:${code}`
- `isBomohQr(text)` matches `/^KEJAR:BOMOH(:|$)/` on the trimmed text
- `bomohCodeFromQr(text)` matches `/^KEJAR:BOMOH:([A-Za-z0-9_-]{1,64})$/` on the trimmed text and returns the code or `null`

Added a `describe("Bomoh's card QR (ruling R15)")` block to `app/shared/ids.test.ts` covering round-trip, bare and malformed codes still counting as card scans, and no cross-matching between Dato and Bomoh cards.

## TDD evidence

RED: after adding the tests and before implementing, `npm test -- ids.test` gave `Tests 3 failed | 11 passed (14)`, with `TypeError: bomohCodeFromQr is not a function` and `TypeError: isBomohQr is not a function`. These failures are expected because the functions did not exist yet.

GREEN: after implementing, `npm test -- ids.test` gave `Tests 14 passed (14)`.

Full suite: `npm test` gave `Test Files 81 passed (81)`, `Tests 1157 passed (1157)`.

## Files changed

- `app/shared/ids.ts`
- `app/shared/ids.test.ts`

The test file's import from `./ids.js` was reformatted to a multi-line import, since adding the new names pushed it past the line length.

## Commit

`8ce4ad7 feat: add bomohQr/isBomohQr/bomohCodeFromQr` (includes the Co-Authored-By trailer).

## Self-review

- Behavior matches the brief's regexes exactly. The helpers mirror the Dato implementation, so they inherit its semantics (a bare card still counts as a card scan).
- The test block is a direct Bomoh analogue of the Dato block, with extra cross-checks for the two card types.
- No concerns. `ids.ts` is small, so no restructuring was needed.
