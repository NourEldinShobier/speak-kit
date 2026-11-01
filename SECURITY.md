# Security policy

## Reporting a vulnerability

Report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/NourEldinShobier/speak-kit/security/advisories/new)). Please do not open a public issue or pull request for a vulnerability.

Include the affected version, the platform, steps to reproduce and what an attacker gains. You can expect an acknowledgement within a week and a fix or a decision within 30 days. Fixes ship in the next release and are credited in the release notes unless you prefer otherwise.

## Supported versions

Only the latest release receives security fixes.

## Scope

In scope:

- **The loopback server** (`code/packages/server`): it binds to `127.0.0.1` only. Reports about reaching it from another machine, from a web page (DNS rebinding, CSRF, a permissive `Origin` or `Host` check) or from another local user.
- **The pairing token**: every route except `/v1/health` needs the bearer token. Reports about the token leaking (logs, URLs, files readable by other users, other extensions), timing or comparison flaws, or a way to call the API without it.
- **Extension permissions** (`code/apps/extension/manifest.json`): `storage`, `contextMenus`, `offscreen`, `sidePanel`, `activeTab`, `scripting`, plus host access to `127.0.0.1` and `localhost`. Reports about text from a page reaching anything but the local server, content scripts exposing the token to a page, or access beyond what these permissions need.
- **The desktop app**: Electron IPC and preload exposure, the packaged installer, and the update check against GitHub Releases.
- **Engines**: Kokoro in a child process and the optional Chatterbox Python sidecar, where they handle untrusted text or files (PDF import, uploaded voice samples).

Out of scope: attacks that need an already compromised machine or administrator rights, the unsigned installer showing a SmartScreen warning (known, see the README), denial of service by a local user who already holds the token, and vulnerabilities in dependencies with no path to Speak Kit (report those upstream).
