# Intake: <package or tool name>

Copy to `docs/decisions/intake-<slug>.md` before proposing a dependency or tool. A positive recommendation becomes an ADR from `TEMPLATE.md` and a row in `0001-stack.md`.

## Status
Proposed | Screened | Adopted | Rejected, YYYY-MM-DD. Asked by: <who>.

## Problem
The concrete problem in one or two sentences, and what already exists in the repo, the platform and the installed packages that was checked first.

## Hard criteria
| Criterion | Answer |
|---|---|
| Licence (and whether it is compatible with shipping) | |
| Last release date, release cadence, maintainers | |
| Version proposed and its age (older than 7 days, see `minimumReleaseAge`) | |
| Platform (Windows x64, Node 24, Electron, Chromium MV3) | |
| Overlap with an existing dependency | |
| Install scripts or native code | |

## Cost
Bundle size (gzip), start-up time, idle CPU and memory, extra processes, install size.

## Lock-in and removal plan
What depends on it and how to take it out.

## Spike and exit test
What was tried outside the repo, with the numbers, and the numeric condition under which the choice is reversed.

## Recommendation
Adopt, reject or wait, with the reason. Recommended answer first, worded so "yes" accepts it.
