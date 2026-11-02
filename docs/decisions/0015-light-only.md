# ADR 0015: Speak Kit has no dark mode (Lockix, light only)

## Status
Accepted, 2026-11-02.

Label: [D] decided. Review by: 2026-12-28. Confirmed or reversed by: none.

## Context
Speak Kit shipped the Lumen look with a light and a dark theme (blue accent fills, `prefers-color-scheme` and `[data-theme=dark]` blocks, a Theme setting in the extension options and the desktop app, a dark reader theme, dark design frames). The product owner chose the Lockix design system (`docs/lockix-design-system.md`), which is light only, near-black primary buttons and blue only for focus, links, selection and progress. Keeping a second theme would mean designing and testing every Lockix component twice.

## Decision
- There is one theme, light. Lockix tokens are the only token set.
- Removed: all dark colour tokens and the `dark` object in `tokens.ts`; every `prefers-color-scheme: dark` and `[data-theme=dark]` block; the Theme setting (extension options, desktop settings, the retired `Theme` config field; a stored dark value is ignored); the dark reader theme (reader themes are `paper` and `light`); the dark window shadows; the dark design frames (`designs/next` has light frames only); dark captures in the visual harness and `designs/built`.
- Kept: adaptation of the in-page UI (pill, bubble, launcher, highlight) to a dark host page, since that is the host's theme and the surfaces stay white and readable (frames B11, B21); the logo and store assets, which have dark variants for dark store and browser surfaces; the reader `paper` theme.
- New UI is designed and tested in light only. A request for a dark theme needs a new ADR that supersedes this one.

## Evidence
`code/packages/ui/src/lumen.css` token blocks (no dark block); commits 8ef3dcf, 210ca85, fa6aba3, 22a91c3, ce6947c, cfec966, 83cf0bb. Not measured: contrast of the white pill over every dark host page; the visual harness covers a sample of hosts.

## Alternatives considered
- Keep dark and derive it from Lockix: Lockix defines no dark values (its parked dark block is incomplete); we would invent a second system.
- Follow the OS setting automatically: same cost as above, and it would make screenshots depend on the machine.

## Consequences
Half the screenshots, design frames and accessibility runs. Users on a dark OS see a light UI. Guardrail: `tokens.test.ts` fails on a hex colour outside the token files; reviewers reject a new `prefers-color-scheme` block or dark token (review, not yet a check).

## Licence
None.

## Decision-record amendment
`docs/decisions/0001-stack.md`: dark theme mentions are superseded by this ADR (no text change needed beyond this link). `docs/design-system.md` and `docs/architecture.md` are updated in the same commit.

## Open questions for the user
None.
