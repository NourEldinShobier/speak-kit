# ADR 0005: Keep the desktop global hotkey defaults, record the AltGr exception

## Status
Accepted, 2026-11-01. Decision D4 of `docs/engineering/refactor-plan.md` section 5, accepted by the user on 2026-11-01.

Label: [D]. Review by: 2026-12-27. Confirmed or reversed by: not yet.

## Context
Gap G59 (rule L9): the desktop defaults in `apps/desktop/src/shared/shortcuts.ts` (lines 7 to 10) are `Ctrl+Alt+S`, `Ctrl+Alt+Space`, `Ctrl+Alt+X` and `Ctrl+Alt+C`. On German, Polish and French Windows layouts the right Alt key is AltGr, which Windows reports as Ctrl+Alt, so these bindings can fire while the user types characters such as `ś`, `ć` or `ź` (AltGr+S, C, X on a Polish programmer layout). The extension's Chrome commands (`Ctrl+Shift+S/Y/X`) are not affected.

## Decision
1. The four desktop defaults stay as they are for new and existing installs.
2. Users can rebind every shortcut in Settings; stored bindings are never changed by an update.
3. The known conflict is accepted for AltGr layouts and documented here. The recorder rejects bindings the OS refuses; it does not warn about AltGr.
4. If a user report or a decision to support AltGr layouts arrives, a superseding ADR changes the defaults for fresh installs only (for example to `Ctrl+Shift+Alt+<key>` or `Win+Alt+<key>`) and leaves stored bindings alone. This is the "no" branch of the decision, already scoped in work package 12.

## Evidence
- `apps/desktop/src/shared/shortcuts.ts:7-10`, refactor plan G59. Ostio ADR 0007 (`ostio-files/docs/ostio-files-architecture-development-flow/adr/0007-keybindings.md`) states the AltGr rule this exception departs from.
- Not tested: behaviour on a real German, Polish or French layout. No Windows machine with those layouts was used. A keyboard test with each layout would prove the conflict and any later fix.

## Alternatives considered
- Change the defaults for fresh installs now: rejected for now. The user keeps the current bindings; rebinding is available.
- Detect AltGr at runtime and suppress the shortcut while a text field in another app has focus: rejected. A global shortcut cannot see another app's focus target.

## Consequences
- Users on affected layouts may trigger Speak Kit while typing certain letters until they rebind.
- Guardrail: the existing `tests/shortcuts.test.ts` asserts the default accelerators; a change of a default needs a new ADR (the decision-record sync check, when it exists, ties `shared/shortcuts.ts` to this ADR).

## Licence
None.

## Decision-record amendment
None.

## Open questions for the user
None open.
