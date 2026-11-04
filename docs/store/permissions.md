# Permissions, data usage and reviewer notes

Source of truth: `code/apps/extension/manifest.json` (version 0.3.0). Each text below is written to be pasted into the Chrome "Privacy practices" tab or the Edge "Privacy" page (1000 characters maximum in Edge; all texts are under that).

## Permission justifications

### `storage`
> Stores the user's settings (voice, speed, highlight style, per-site rules) in chrome.storage.sync, the pairing token for the local Speak Kit app in chrome.storage.local, and short-lived playback state in chrome.storage.session so the extension resumes correctly after the service worker restarts. No data leaves the browser except through the browser's own settings sync.

### `contextMenus`
> Adds the right-click items "Read selection" and "Add to queue" so the user can start reading the selected text from the page.

### `offscreen`
> Creates an offscreen document with reason AUDIO_PLAYBACK. The speech audio is streamed from the local Speak Kit app and must keep playing when the popup closes or the tab is in the background; a service worker cannot play audio. The document is closed 60 seconds after playback stops.

### `sidePanel`
> Provides the queue side panel: the list of pages waiting to be read and the outline of the current page. It opens only when the user asks for it.

### `activeTab`
> When the user clicks the toolbar button, uses a keyboard shortcut or a context-menu item, the extension needs to read the selected text and the readable text of that one tab, including pages where the always-on content script is not present. Access is limited to the tab the user acted on.

### `scripting`
> Used with activeTab to run the extension's own packaged script (content.js) in the current tab on demand, and to read the current text selection when the popup opens. The extension injects only files bundled in its package; it never injects remote or user-supplied code.

### Host permission: `http://127.0.0.1/*`
> The extension sends the text to be spoken to, and receives audio from, the Speak Kit desktop app that runs on the user's own computer and listens only on 127.0.0.1. This is the only network destination the extension contacts. Requests carry a pairing token the user copied from the app; the app rejects other origins.

### Content script on `http://*/*`, `https://*/*`, `file:///*`
> The content script lets the user read any web page: it extracts the page text, shows the selection bubble, the floating player and the edge launcher, and highlights the sentence and word being read. It cannot work on a fixed list of sites because the user can read any site. It does not read or send page content anywhere except, when the user starts reading, the text to be spoken goes to the Speak Kit app on 127.0.0.1. It stays idle until the user acts on a page.

### `web_accessible_resources`: `content-ui.js`
> The content script loads the player and reader interface (content-ui.js, bundled in the package) into the page on first use. It is exposed to the same pages as the content script and uses a dynamic URL so pages cannot detect the extension.

Commands (`read-selection`, `play-pause`, `stop`) need no permission. The extension does not request `clipboardRead` and never reads the clipboard; it only writes to it when the user presses Copy (`src/manifest.test.ts` checks the permission).

## Remote code

"No, I am not using remote code." All JavaScript is in the package; the pack script fails if it finds `eval`, `new Function`, remote `<script>` tags or `import()` of an http URL. The extension makes `fetch` calls only to 127.0.0.1, and those return audio, not code.

## Data usage disclosure

Leave every "data collected" checkbox empty. Reasoning: the extension does not transmit any user data to the developer or any third party. Page text is processed on the user's computer by the user's own Speak Kit app over the loopback interface; the pairing token and settings stay in the browser. If a reviewer asks, the honest summary is: "Website content (the text the user asks to read) is sent to the user's own computer at 127.0.0.1 and nowhere else."

If you prefer the more conservative answer, tick "Website content" only, and state the same sentence in the justification. This is a judgement call; the first answer matches Google's wording that collection means leaving the device.

Certifications (tick all three):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Edge asks the same questions; use the same answers.

Privacy policy URL: `https://github.com/NourEldinShobier/speak-kit/blob/main/docs/store/privacy-policy.md`

## Reviewer test instructions

Paste into Chrome "Test instructions" and Edge "Notes for certification":

```
Speak Kit is the browser half of a local text-to-speech product. It needs the free Speak Kit desktop app (Windows), which runs the voice model on the same computer. The extension only talks to http://127.0.0.1.

To test the full flow:
1. Download Speak-Kit-Setup-<version>.exe from https://github.com/NourEldinShobier/speak-kit/releases/latest and run it (it is not code-signed; SmartScreen: More info, Run anyway). On first run the app downloads a 180 MB voice model.
2. In the app, open Browser and copy the pairing token.
3. In the extension, open Options, General, paste the token under Pairing token, press Test connection.
4. Open any article, select a paragraph and press Ctrl+Shift+S, or click the toolbar icon and press Read page.

Without the desktop app the extension is still safe to review: the popup shows "Speak Kit app is not running" with install steps, and no network request leaves the machine other than the failed request to 127.0.0.1. Source code: https://github.com/NourEldinShobier/speak-kit (code/apps/extension).
```

Update `<version>` and make sure that release exists and is public before submitting; a reviewer who cannot install the app will reject for "cannot verify functionality".

## Permissions that could be narrowed or removed

Ordered by how likely they are to cause a rejection or a long review.

1. **Content script and `web_accessible_resources` on all http, https and file URLs.** Google lists patterns such as `https://*/*` and `<all_urls>` as the main reason for slow review (review-process page). The justification above is honest but reviewers still check it by hand.

   Narrowest correct form, in order of preference:

   a. **`activeTab` + on-demand injection, no static content script.** Drop `content_scripts` and the `file:///*` match. The code already injects `content.js` on demand (`app/background/reading.ts`, `chrome.scripting.executeScript`). The extension then runs only on the tab the user clicked or used a shortcut on. What is lost: the selection bubble, paragraph play gutter and edge launcher would not appear until the user has invoked Speak Kit once on that tab; right-click menu, shortcuts and the popup work as today. Reading continues across page reloads only after another invocation.

   b. **Optional host permissions, content script registered at runtime** (recommended). Move `http://*/*` and `https://*/*` to `optional_host_permissions`. By default the extension behaves as in (a). The options page offers "Show Speak Kit controls on this site" and "on all sites" (the existing per-site setting, `sites`: `always-dock`); turning it on calls `chrome.permissions.request` and `chrome.scripting.registerContentScripts` for that origin. Users who want the launcher everywhere keep every feature; the store review sees no broad host permission in the manifest. `web_accessible_resources` can then keep `matches` as `http://*/*`, `https://*/*` (the match list there does not need a host permission), but without `file:///*`.

   c. **Keep as is.** Works, but expect a longer review and a likely follow-up question. Drop only `file:///*` from `content_scripts` and `web_accessible_resources`: local files need the user to switch on "Allow access to file URLs" in Chrome anyway, and (a) or (b) cover them when allowed.


2. **`file:///*` in `content_scripts` and `web_accessible_resources`.** See item 1c.

3. **`activeTab` next to the content script.** Needed today because the content script's match patterns do not give `scripting.executeScript` access; it stays under every option above.

Other points checked and fine: no `tabs`, `history`, `webRequest`, `cookies`, `downloads` or `<all_urls>` is requested; there is no `content_security_policy` override; `minimum_chrome_version` 116 covers `sidePanel` (114) and `offscreen` (109).

Manifest changes this implies (not made here): for (b) add `optional_host_permissions`, remove `content_scripts`, register scripts from the background and request the permission from the options page; add the matching tests in `apps/extension`.

## Other findings for the manifest owner

- `LINKS` in `src/shared/links.ts` points at `https://speakkit.app`, `/download`, `/help`. If that domain is not live and owned before submission, change the links (for example to the GitHub repo and releases page) or the reviewers will meet dead links; the listing already uses GitHub URLs only.
- The manifest has no `default_locale`; that is fine for a single language, but add `_locales/en` first if more languages are planned, because Edge only detects languages from `__MSG_` placeholders.
