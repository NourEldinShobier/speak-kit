# ADR 0007: Releases stay unsigned until a signing account exists

## Status
Accepted, 2026-11-01. Decision D6 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [D]. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
Gap G57 (rule S12): the Windows installer and portable build are not code-signed (header comment of `.github/workflows/release.yml`). `docs/testing.md` lists SmartScreen behaviour as untested. Signing needs a certificate or a signing service account and recurring money, which only the user can provide.

## Decision
1. Releases are published unsigned. The installer and the portable executable show a SmartScreen warning on first run; the README and release notes say so (owned by other packages).
2. `electron-updater` verifies downloads against the SHA-512 in `latest.yml` from the same GitHub Release. Without a signature this protects against corruption, not against someone who controls the release. The risk is listed in `docs/threat-model.md` under "tampered update".
3. Revisit when the user has a signing account, when the first non-friend user installs, or when the updater is switched on by default for a wider audience. Then a superseding ADR picks the service and adds a signing step to `release.yml`.

## Evidence
- `.github/workflows/release.yml` header comment, `apps/desktop/electron-builder.yml`, `docs/testing.md` "not run" list.
- Not tested: how SmartScreen reacts to this build today, and whether `electron-updater` rejects an unsigned update on Windows (it does not by default for unsigned apps; reasoned from the library's documented behaviour, not run).

## Alternatives considered
- Buy a certificate now: rejected; money and account decisions belong to the user.
- Block releases until signed: rejected; blocks all distribution for a private project.

## Consequences
- Installs need the user to click through the SmartScreen warning.
- Guardrail: the release workflow publishes `latest.yml` with SHA-512; `docs/releasing.md` (owned elsewhere) should state the unsigned status. No automated check of signing exists, by design.

## Licence
None.

## Decision-record amendment
None.

## Open questions for the user
None open.
