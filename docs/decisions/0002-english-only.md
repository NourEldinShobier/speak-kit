# ADR 0002: English only for now, with cheap localization preparation

## Status
Accepted, 2026-11-01. Decision D1 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [D]. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
Gap G58 (rules L1 to L8, L13): there is no localization system. The plan counts 351 JSX text literals outside tests, at least 10 manual plural branches (`n === 1 ? "x" : "xs"`) and 5 `toLocale*String` calls. A message catalog with compiled ICU messages (work package 17) costs about 28 agent-hours and adds a dependency. Speak Kit ships only an English UI and an English-first voice set (`docs/scope.md`).

## Decision
1. The product UI stays English-only. No message catalog, no `t()` calls, no new locale files.
2. Cheap preparation happens inside the packages that are refactored anyway: one `plural(count, one, other)` helper built on `Intl.PluralRules` and one shared `compareNames` (an `Intl.Collator` with `numeric: true, sensitivity: "base"`), both in `packages/protocol/src/format.ts`; dates and numbers go through `Intl` formatters; new CSS uses logical properties; document titles carry `dir="auto"`.
3. New user-visible strings are written as complete English sentences (no string concatenation around a count or a name), so a later catalog extraction is mechanical.
4. Work package 17 stays parked. Reopening it needs a new ADR that supersedes this one and names the first target locale.

## Evidence
- Counts and file lines: `docs/engineering/refactor-plan.md` section 1 and G58, G60, G61 (grep and oxlint on 2026-11-01).
- Not measured: the effort figure of 28 hours is an estimate [est.]; no catalog spike was run.

## Alternatives considered
- Full localization now (WP-17, `@formatjs/intl`): rejected for now. About 28 hours and a new dependency for a product with no second-language user or translator.
- No preparation at all: rejected. The helpers cost about 2 hours and remove the manual plural branches and `localeCompare` calls that would otherwise be rewritten later.

## Consequences
- Users see English regardless of browser or OS language.
- Guardrail: `code/scripts/check-css.mjs` (WP-1) fails on physical CSS properties without an allow marker; the ratchet counts manual plural branches and `localeCompare` calls and may only shrink. A grep check that rejects `toLocale*String` outside `format.ts` is proposed for WP-1.

## Licence
None. Ideas only (Ostio rules L1 to L13).

## Decision-record amendment
None. `docs/scope.md` is not edited here; this ADR is the record of the English-only scope.

## Open questions for the user
None open.
