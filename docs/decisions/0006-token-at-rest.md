# ADR 0006: The pairing token stays a file and an extension storage entry

## Status
Accepted, 2026-11-01. Decision D5 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [D]. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
Gap G53 (rule S6): the loopback server's pairing token is stored in `<dataDir>/token` (a mode of 0600 has no effect on Windows) and in `chrome.storage.local` of the extension. Ostio keeps secrets in the OS keychain only. The token is shared with the extension and with the standalone server CLI, none of which can read the Windows credential store without a native module.

## Decision
1. The token remains a file in the data directory and an entry in `chrome.storage.local`. This is an accepted risk, listed in `docs/threat-model.md` under "local process reads the token file".
2. The token is not the only gate. The server also checks the `Origin` header (only `chrome-extension://` ids, optionally pinned through `allowedExtensions`, or no Origin), the `Host` header, and compares the token with `timingSafeEqual`. A web page cannot send the token because it cannot read either storage location.
3. The token is never written to logs, error bodies or the privacy page examples. Rotation: deleting `<dataDir>/token` makes the app create a new one at the next start and the extension reports `token-rejected` until it is paired again.
4. Revisit when any of these holds: Speak Kit stores a second secret; the app gains a feature that is more sensitive than local text-to-speech; a keychain-backed Node module is already in the dependency tree.

## Evidence
- `apps/desktop/src/main/pairing.ts`, `packages/server` auth code, `docs/engineering/refactor-plan.md` G53 and the "Followed" note for S5.
- Not tested here: that a standard user process on Windows can read the file (it can, by design of the user profile permissions; reasoned, not run).

## Alternatives considered
- Windows Credential Manager through a native module: rejected for now. It adds a native dependency and the extension and CLI would still need the value, so the secret would be copied out anyway.
- Per-session tokens issued by the app and confirmed by the user: rejected for now. It breaks the "install the extension and it works" pairing flow.

## Consequences
- A process running as the same Windows user can read the token and call the loopback server. That process can already read the user's documents, so the added exposure is the ability to call the loopback `/v1/*` routes.
- Guardrail: tests for Origin, Host and token checks exist in the server package; a hostile-client e2e spec is planned in work package 13.

## Licence
None.

## Decision-record amendment
None.

## Open questions for the user
None open.
