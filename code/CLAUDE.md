# Working in this repo

- Toolchain is Vite+ (`pnpm exec vp ...`: dev, build, test, lint, fmt, check) on Node 24 and pnpm 12. Type-check with tsrs (`pnpm exec tsrs --noEmit -p <dir>`); fall back to `tsc` if tsrs fails and say so.
- Do not build what a maintained package already does: search npm and GitHub first, compare license, size, maintenance and speed, then use it. Check the platform and installed packages too; record each new package in docs/decisions/0001-stack.md.
- Features live in `src/features/<name>/`; import another feature only through its `index.ts`. Wire contracts live in `packages/protocol`.
- UI comes from `packages/ui` (the real Lumen components) and `tokens.css`; never hard-code hex values in components. Spec: docs/design-system.md, docs/lumen-components.md.
- Every change ships with tests; a bug fix starts with a failing test. UI changes update the screenshots named after the design frame id (`<ID>-<what>-<theme>.png`).
- Conventional Commits.
- Designs: `designs/review.html`, frames A to K by id; source `designs/speakkit.figcraft`; generator `designs/gen`.
