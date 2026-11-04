# Speak Kit privacy policy

Last updated: 1 November 2026

Speak Kit is a text-to-speech product made of a browser extension (Chrome, Edge and other Chromium browsers) and a Windows desktop app. This policy covers both. It is also the policy linked from the Chrome Web Store and Microsoft Edge Add-ons listings.

**Short version: Speak Kit does not collect your data. The text you have read aloud, your settings and your library stay on your computer. There are no accounts, no analytics, no advertising and no tracking.**

## Who is responsible

Speak Kit is an open-source project by Nour Eldin Shobier. Source code: https://github.com/NourEldinShobier/speak-kit. Questions about privacy: open an issue at https://github.com/NourEldinShobier/speak-kit/issues.

## What the extension does with your data

- **Page text.** When you start reading (a shortcut, the toolbar button, the on-page controls or the right-click menu), the extension reads the text of the selection or the page and sends it to the Speak Kit desktop app running on your own computer, at the address 127.0.0.1 (the loopback interface, which never leaves your machine). The app turns it into speech and sends the audio back. The extension does not send page text to any other address.
- **Pairing token.** A random token that you copy from the desktop app into the extension options. It is stored in the browser's local extension storage and is sent only to 127.0.0.1, to prove that the extension is allowed to use your app.
- **Settings.** Voice, speed, highlighting, shortcuts and the sites where the controls appear are stored with the browser's extension storage. If you are signed in to your browser and sync is on, the browser's own sync service (Google for Chrome, Microsoft for Edge) may copy the settings to your other devices under that company's privacy policy. The page text and the pairing token are not stored in synced storage.
- **What the extension never does.** It never reads your clipboard (it asks for no clipboard permission; you paste the token into the options field yourself). It does not contact the developer or any server, does not read pages in the background to send them anywhere, has no analytics or advertising code, does not load code from the internet, and does not sell or share data.

## What the desktop app does with your data

- Runs a local server that listens only on 127.0.0.1 and accepts only requests that carry the pairing token. Text you send for reading, files and pages you add to the library, and exported audio files are kept on your computer, in the app's data folder and the places you choose for exports. Deleting an item in the app or uninstalling the app removes them.
- Makes a network connection only when you or the app's update check need one:
  - **Voice model download.** On first setup, the app downloads the Kokoro voice model from Hugging Face (huggingface.co). Hugging Face sees the usual connection information (your IP address, the file requested) under its own policy. No text is sent.
  - **Updates.** The app asks GitHub Releases (github.com) whether a newer version exists and, if you agree, downloads it. GitHub sees the usual connection information under its own policy.
  - **Web addresses you add.** If you add a page to the library by its address, the app downloads that page from that site, like a browser would.
- Does not send crash reports or usage statistics.

## Voices that clone a voice

If you use the optional Chatterbox engine with a reference clip, the clip is read from the file you choose and processed on your computer. It is not uploaded.

## Children

Speak Kit is a general-purpose tool and does not knowingly collect any information from anyone, including children.

## Your choices

- Remove the extension to delete everything it stores in the browser. Remove the pairing token in the extension options at any time; the desktop app can create a new one.
- Quit the desktop app and the extension can no longer reach any speech service.
- Delete library items and exports in the app, or delete the app's data folder.

## Changes

If this policy changes, the new text is published at the same address with a new date at the top, and the change is described in the release notes. The history is in the repository.

Address of this policy: https://github.com/NourEldinShobier/speak-kit/blob/main/docs/store/privacy-policy.md
