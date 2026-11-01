# ADR 0009: The desktop renderer keeps loading from file://

## Status
Accepted, 2026-11-01. Decision D8 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [D]. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
Gap G51 (rule S3): the renderer pages load with `loadFile` (`apps/desktop/src/main/main-window.ts:141`, `windows.ts:59`), so their origin is `file://`. A custom protocol (`app://`) would give the pages a real origin and let Electron enforce stricter same-origin rules, but it changes the page origin, which resets `localStorage` and the origin the server and speak proxy see.

## Decision
1. Keep `loadFile`. Do not add a custom protocol now.
2. Compensate in the secure-window factory (work package 11): deny every permission request and check (`media`, `geolocation`, `notifications` and the rest), `spellcheck: false`, `webSecurity: true`, navigation and window-open denial (already present), and the Content-Security-Policy `<meta>` tag per page (already present).
3. The server keeps rejecting `file://` origins by design; the renderer reaches the engine only through the main-process speak proxy (`main/library/speak-proxy.ts`, see `0001-stack.md`). That design does not depend on the page origin.
4. Revisit if a feature needs a real origin (service worker, `fetch` of local resources, per-page storage isolation), or if Electron deprecates `file://` loading for sandboxed windows.

## Evidence
- `apps/desktop/src/main/main-window.ts`, `windows.ts`, `secure-window.ts`; refactor plan G51.
- Not measured: the localStorage reset cost of switching (the renderer stores little there; unverified count). Not tested: permission denial, which work package 11 adds as a test.

## Alternatives considered
- Custom `app://` protocol: rejected for now; page origin and storage change, migration needed, no concrete attack closed that the permission handlers do not.
- Loopback HTTP for the renderer: rejected; opens another listening port.

## Consequences
- Pages share the opaque `file://` origin rules of Chromium; the CSP meta tag and the sandbox are the boundary.
- Guardrail: a secure-window test requests `media`, `geolocation` and `notifications` and expects denial (work package 11).

## Licence
None.

## Decision-record amendment
None.

## Open questions for the user
None open.
