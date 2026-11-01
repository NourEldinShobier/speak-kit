# Publishing Speak Kit to the Chrome Web Store and Microsoft Edge Add-ons

Everything the dashboards ask for is prepared in this folder:

| File | Used for |
|---|---|
| `listing.md` | name, descriptions, category, URLs |
| `permissions.md` | permission justifications, data-usage answers, the narrowing proposal |
| `privacy-policy.md` | the privacy policy URL both stores require |
| `assets/` | icon, 5 screenshots (1280x800), small tile (440x280), marquee (1400x560) |
| `code/apps/extension/scripts/pack-store.mjs` | builds and checks the zip |

Sources: Chrome Web Store docs at developer.chrome.com/docs/webstore (publish, register, images, update, review-process, cws-dashboard-privacy, cws-dashboard-listing); Edge docs at learn.microsoft.com/microsoft-edge/extensions/publish (publish-extension, create-dev-account). Dashboard labels change; if a label below does not match, the order of the steps still holds.

## 0. Before the first upload

1. The privacy policy must be reachable. Make the repo public, then use this URL in both dashboards:
   `https://github.com/NourEldinShobier/speak-kit/blob/main/docs/store/privacy-policy.md`
   It renders as a page and does not change unless `main` changes the file. The raw URL also works but shows plain text. GitHub Pages is an option later; do not change the URL in a store afterwards without resubmitting the privacy fields.
2. Decide the manifest permission question in `permissions.md` (broad content-script matches). Narrowing it after the first release means a new review and a permission-change warning for existing users, so it is cheaper to decide before the first upload.
3. Build and check the zip:
   ```
   cd code/apps/extension
   node scripts/pack-store.mjs
   ```
   It builds a production bundle (no source maps, no test hooks), runs the store checks and writes `dist-store/speakkit-extension-<version>.zip`. Every line must read PASS. The version comes from `manifest.json`.
4. Test the zip once as a normal user: unzip into a folder, load it unpacked at `chrome://extensions` (Developer mode) and edge://extensions, pair it with the desktop app.

## 1. Chrome Web Store

### 1.1 Developer account

1. Sign in at https://chrome.google.com/webstore/devconsole with a Google account. Use a dedicated address that you check often: review results and policy warnings go there, and the address cannot be changed later (register page).
2. Turn on 2-Step Verification for that Google account (required to publish).
3. Accept the Developer Agreement and pay the one-time US$5 registration fee (https://developer.chrome.com/docs/webstore/register).
4. In the dashboard Account tab fill the publisher name, contact email (verify it from the mail Google sends) and the trader or non-trader declaration for the EU. A non-trader publisher's address is not shown.

### 1.2 Create the item and upload

1. Dashboard, Add new item, choose the zip, Upload. A manifest or zip error shows at once; fix and upload again (https://developer.chrome.com/docs/webstore/publish).
2. Package tab: shows what was uploaded; it cannot be edited for the first version.

### 1.3 Store listing tab

Fill from `listing.md`: description, category, language. Upload from `assets/`: the 128x128 icon, up to five 1280x800 screenshots, the 440x280 small tile and the 1400x560 marquee. Only the icon and one screenshot are required (https://developer.chrome.com/docs/webstore/cws-dashboard-listing, `/images`). Add the homepage and support URL.

### 1.4 Privacy tab

Fill from `permissions.md`, in this order (https://developer.chrome.com/docs/webstore/cws-dashboard-privacy):

1. Single purpose description.
2. One justification text per permission and per host permission listed there. If a permission appears in the list that you do not need, remove it from the manifest and upload a new zip first.
3. Remote code: "No, I am not using remote code".
4. Data usage: leave every collection checkbox empty and tick all three certifications (answers and reasoning in `permissions.md`).
5. Privacy policy URL from step 0.
6. Test instructions for the reviewer: paste the text in `permissions.md`, section "Reviewer test instructions". The extension does nothing useful without the desktop app, so this field matters.

### 1.5 Distribution tab

Visibility Public (or Unlisted for a first soft launch: anyone with the link can install, it is not searchable; change to Public later and republish). Regions: all. Free of charge, no in-app purchases.

### 1.6 Submit

Save draft, then Submit for review. The dialog has "Publish automatically after approval"; untick it to publish by hand at a time you choose (you have 30 days after approval, then the submission returns to draft).

### 1.7 Review

- Most submissions finish within a day and over 90 percent within three days (review-process page, figures from early 2021). New developers, new permissions, broad host access and large code changes slow it down; expect days, not hours, for the first submission.
- Broad host permissions (`https://*/*`, `<all_urls>`) and sensitive permissions get the longest review. The manifest of Speak Kit has `http://*/*`, `https://*/*` and `file:///*` content-script matches; see `permissions.md` for the narrower form.
- Obfuscated code is rejected; minified code is allowed but harder to review. The pack script produces a minified, unobfuscated bundle. Keep the source repo link in the listing so reviewers can compare.
- Result mails go to the publisher address. A rejection names the policy; fix it, upload a new zip with a higher version and resubmit. One appeal per enforcement action through the One Stop support form.
- The status page shows Pending review, Published, Rejected, or Staged.

### 1.8 Versioning and updates

- Each upload needs a higher `version` in `manifest.json` than the last published one (1 to 4 dot-separated integers, 0 to 65535 each, no leading zeros). Bump `apps/extension/manifest.json` and `apps/extension/package.json` together, rebuild with the pack script, upload under Package, Upload new package.
- Changing listing text, privacy answers or permissions also needs Submit for review. A new permission or host permission disables the extension for existing users until they accept it, so do it rarely.
- Approved updates reach installed browsers on Chrome's own update check, which runs periodically (every few hours) with no push; users can force it with "Update" on `chrome://extensions` in Developer mode. Items with over 10,000 weekly active users can use percentage rollout (https://developer.chrome.com/docs/webstore/update).
- An update in review does not touch the live version.

## 2. Microsoft Edge Add-ons

The same zip is accepted (the extension uses only Chromium extension APIs). Source: https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension.

1. Register at https://partner.microsoft.com/dashboard/microsoftedge/public/login (https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account). No registration fee. Sign in with a Microsoft account; a GitHub account can create one for you. Choose Individual or Company.
2. Overview, Create new extension, drop the zip. Fix validation errors and upload again.
3. Availability: Public (or Hidden: only people with the link). Markets: all.
4. Properties: category, website (the GitHub repo; Edge requires a page that is not the store listing), support contact (the issues URL), mature content off.
5. Privacy: same four answers as Chrome (single purpose is limited to 100 characters in the form; a 100-character version is in `listing.md`), permission justifications (1000 characters each), remote code No, data usage, privacy policy URL.
6. Store listings, language English (United States): description (250 to 10,000 characters), logo (PNG, 1:1, 300x300 recommended, 128x128 minimum), small tile 440x280, large tile 1400x560 (PNG), up to six screenshots at 1280x800 or 640x480, search terms.
7. Publish. In "Notes for certification" paste the reviewer instructions from `permissions.md`. Certification takes up to seven business days.
8. Updates: Packages, upload the new zip with a higher version, update notes in "Notes for certification" (state what changed), Publish. Installed browsers pick the update up after certification, on Edge's periodic extension update check.

Differences from Chrome:

| Topic | Chrome Web Store | Edge Add-ons |
|---|---|---|
| Fee | US$5 once | none |
| Dashboard | Chrome Developer Dashboard | Microsoft Partner Center |
| Short description | taken from manifest `description` (132 max) | taken from manifest `description` (read-only in the form) |
| Name | from manifest | from manifest |
| Single purpose field | free text | 100 characters |
| Screenshots | 1280x800 or 640x400, up to 5 | 1280x800 or 640x480, up to 6 |
| Logo | 128x128 icon from the zip | separate 1:1 upload, 300x300 recommended |
| Promo tiles | 440x280 PNG or JPEG, 1400x560 | 440x280, 1400x560 PNG |
| Test notes | Privacy tab, test instructions | "Notes for certification" at submit |
| Review time | usually under 3 days | up to 7 business days |
| Staged publish | yes, 30 days | no equivalent |
| Percentage rollout | over 10,000 users | none documented |

## 3. Checklist per release

1. Bump the version in `manifest.json` and `package.json`.
2. `node scripts/pack-store.mjs`; all PASS.
3. Regenerate screenshots if the UI changed (`code/apps/extension/store/README.md`).
4. Upload to both stores, Submit for review (Chrome) and Publish (Edge).
5. Tag the GitHub release with the same version so the zip the stores received can be reproduced.

## 4. Later: automation

Both stores have upload and publish APIs (Chrome Web Store API: https://developer.chrome.com/docs/webstore/using-api; Edge Add-ons API: https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api). They were not verified here and need credentials stored as repository secrets, so the first release is done by hand.
