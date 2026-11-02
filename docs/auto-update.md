# Automatic updates

Speak Kit checks GitHub Releases for a newer version, downloads it in the background and installs it only when the user says so. Code: `code/apps/desktop/src/main/updates.ts` (flow, pure and unit-tested), `updates-service.ts` (wiring), `src/shared/updates.ts` (state and wording), `src/renderer/UpdateCard.tsx` (UI).

## How it works

| Build | Mode | Behaviour |
| --- | --- | --- |
| Windows installer (NSIS), installed | `auto` | electron-updater: check, download, install. |
| macOS (unsigned) | `manual` | Squirrel.Mac cannot replace an unsigned app. Once a day the app asks the GitHub API for the latest release (no token, public repo). A newer one becomes the state `manual`: the card and the title bar pill show the version, a Release notes button and a Download button, both of which open the release page in the browser. |
| Windows portable exe, source checkout, Linux | `unsupported` | No checks. The card says the copy does not update itself. |

The mode comes from `updateMode()`. Timing: first check 30 s after start, then every 24 h, only while Settings > About > "Check automatically" is on. "Check for updates" (About and the tray) runs the same check at any time. A found update downloads at once (`autoDownload` is off in the library; the app calls the download itself so it controls the states).

States (`UpdateState`): `unsupported`, `idle`, `checking`, `available`, `downloading`, `ready`, `restarting`, `manual`, `error`.

### Nothing installs without the user

When the download finishes the state is `ready` and the pill "Update ready" appears. The user picks one of:

- **Install when I quit**: arms electron-updater's `autoInstallOnAppQuit`. The silent installer runs when the app exits; the app does not reopen. The quit dialog (K11) lists "Speak Kit X installs".
- **Restart now**: stops work, runs the installer silently (`quitAndInstall(true, true)`) and reopens the app.
- Doing nothing keeps the current version. "Remind me later" hides the pill for a day.

**Reading or export running.** Restart now would stop it, so the card asks first ("Restart to install X?": Keep working / Restart anyway). The same guard sits in `Updates.installNow()`, so the tray item "Restart to update" cannot restart over a running reading either: it brings the About page forward instead. "Install when I quit" needs no confirmation; the quit dialog already says what stops.

### Failures

Every failure becomes the state `error` with a reason and the phase (`check` or `download`), worded by `updateErrorText()`:

| Reason | Typical message | Card says |
| --- | --- | --- |
| `offline` | `net::ERR_INTERNET_DISCONNECTED`, `ENOTFOUND`, `ECONNREFUSED`, `fetch failed` | Cannot reach the update server, check the connection. |
| `not-found` | `Cannot find latest.yml ... 404`, GitHub 404 | No update information is published at the update address yet. |
| `checksum` | `sha512 checksum mismatch` | The file did not match its checksum and was discarded; nothing was installed. |
| `interrupted` | `ECONNRESET`, `ERR_CONNECTION_RESET` | The connection dropped during the download. |
| `other` | anything else | The raw message. |

"Try again" runs the check and the download again; electron-updater discards a file that failed its checksum and refetches. The daily check retries on its own. A failed update never changes the installed version.

## Channels

Stable only. The feed is the latest non-draft, non-prerelease GitHub release. Prereleases are not offered (`allowPrerelease` stays off). A beta channel would need a second tag pattern and a setting; not built.

## How a release becomes an update

1. Bump nothing by hand: push a tag `vX.Y.Z`. `release.yml` runs `scripts/package.mjs --version X.Y.Z`, which builds the installer, its `.blockmap` and `latest.yml`.
2. The workflow attaches `Speak-Kit-Setup-X.Y.Z.exe`, the blockmap and `latest.yml` to the GitHub release (`publish:` in `electron-builder.yml`: provider `github`, owner `NourEldinShobier`, repo `speak-kit`).
3. Installed apps read `latest.yml` from the latest release, compare its `version` with theirs and, when newer, download the installer named in it and verify its sha512.
4. macOS apps read the same release through the API and show its page.

`updates.test.ts` checks that the owner and repo in the code match `electron-builder.yml`. The repo must be public (or the app would need a token); the app never carries one.

## Test it

Unit tests (fast): `pnpm exec vp test run src/main/updates.test.ts src/shared/updates.test.ts src/renderer/UpdateCard.test.tsx` in `code/apps/desktop`. They cover the flow, every failure above, the manual mode, the busy guard, the mode table and the GitHub lookup.

Source checkout with a fake updater (used by `tests/system.test.ts`): `SPEAKKIT_TEST=1 SPEAKKIT_FAKE_UPDATE=0.2.0` makes a check find that version; `SPEAKKIT_UPDATE_MANUAL=0.9.0` forces the macOS flow on any unpackaged build. Both are ignored by packaged builds.

### Real update on Windows, without GitHub

```
cd code/apps/desktop
node scripts/update-e2e/run.mjs
```

It builds two installers with `scripts/package.mjs --version 0.3.1` and `--version 0.3.2` (reused from `release/update-e2e/` on later runs; `--rebuild` forces new builds; `--old` / `--new` change the numbers; `--only quit|restart` runs one scenario), serves the newer one with `latest.yml` from a local static server, and then for each of the two scenarios:

1. silent-installs 0.3.1 into a temp folder (`/S /D=...`) and starts it with an isolated `SPEAKKIT_USER_DATA`, a free `SPEAKKIT_PORT` and `SPEAKKIT_UPDATE_URL` pointing at the server;
2. drives the app over `--remote-debugging-port` with the renderer's own API (`window.speakkit.updateAction("check")`, ...) and asserts `checking > available > downloading > ready`, and that the app fetched `latest.yml` and the installer from the local server;
3. **Install when I quit**: arms it, quits with `Speak Kit.exe --quit`, waits for the installer, asserts 0.3.2 is on disk and the app did not reopen, starts it and reads `/v1/health`. **Restart now**: triggers it and waits for the relaunched app to report 0.3.2 on `/v1/health`;
4. uninstalls silently.

The installer writes the Uninstall entry, the `speakkit` URL protocol key and the shortcuts. The script snapshots them first (`reg export`, shortcut bytes), restores anything that differs when it is done, and fails if the machine is not as found. A full run took about 40 minutes on a loaded machine (the silent install of the 190 MB build dominates). In it the update installer left one extra Uninstall key behind after the uninstall; the script removed it and reported "restored after the run". Run one scenario at a time, not alongside another installer test.

### The feed override

`SPEAKKIT_UPDATE_URL=http://127.0.0.1:PORT/` switches electron-updater to the generic provider for that folder. It is read in every build (the e2e runs the packaged app), accepts only `http(s)` addresses and is ignored otherwise. Without it the feed is GitHub. An isolated `SPEAKKIT_USER_DATA` (smoke tests) keeps updates off unless this variable is set, so a smoke run never contacts GitHub. Setting an environment variable in the user's session already allows running arbitrary code as that user, so the override adds no capability; the downloaded installer is still verified against `latest.yml`'s sha512.

## Not covered

- Code signing: the installer is unsigned, so Windows SmartScreen warns on first install; updates inside the app do not show that prompt.
- A prerelease channel, delta-download tests (the e2e feed has no previous blockmap, so electron-updater takes the full download), rollback after a bad release.
