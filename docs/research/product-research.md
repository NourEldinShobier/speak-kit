# Speechify and Edge Read Aloud: what they do (researched 2026-11-01)

Screenshots: `screenshots/speechify/` (home, Chrome extension page, web app, TTS online), `screenshots/edge-read-aloud/feature-page.png`, `screenshots/other/out-loud-readme.png`, `screenshots/pinterest/pin-01..20.jpg` (UI mood references; mostly phone mockups).

## Speechify (paid, cloud voices)
- Surfaces: Chrome and Edge extension, web app, iOS, Android, Mac, Windows. Chrome extension shows a floating vertical dock on the page: play/pause, chat/summary, mic (voice typing), skip back/forward 10 s, voice avatar, speed (1.5×).
- Reads web pages, Google Docs, email, PDF, EPUB, DOCX, scanned pages (OCR on mobile). 1000+ voices, 60+ languages, up to 4.5× (900 wpm).
- Read-along: current sentence highlighted, text scrolls with audio. Library with progress, sync across devices, offline download on paid plans.
- Extras we are not copying: celebrity voices, AI chat on the page, dictation, podcasts, meeting notes. SpeakKit stays text-to-speech only.
- Design cues: dark UI with indigo accent, large rounded cards, voice library with portraits, speed panel with presets (0.8×, 1×, 1.2×, 1.5×, 2×, 2.5×) and a vertical slider.

## Microsoft Edge Read Aloud (free, built in)
- Start: Ctrl+Shift+U, address-bar icon, right-click, or Immersive Reader (F9). Works on pages and PDFs opened in Edge. Starts from selected text if there is a selection.
- Toolbar at the top of the page: previous, play/pause, next, Voice options. Voice options: speed slider (Slow, Normal, Fast; 0.5× to 2.5×) and a "Choose a voice" dropdown of Microsoft "Online (Natural)" voices in many accents.
- Highlight: current word in yellow inside a light-blue sentence band.
- Limits: tied to an open desktop tab, no library, no offline listening queue, no OCR for scanned PDFs, natural voices need internet.

## Closest open-source project: Out Loud (light-cloud-com/out-loud, MIT)
Electron + React + Vite, Kokoro-82M via onnxruntime-node in a worker, espeak-ng, local HTTP API on 127.0.0.1:51730 used by Chrome/Safari extensions. SpeakKit adds Chatterbox, PDF reader, library, read-along highlight, dock, mini player.

## What SpeakKit takes from each
| Idea | From |
|---|---|
| Floating dock with 10 s skips and speed chip | Speechify |
| Word-in-sentence highlight, voice dropdown, Ctrl+Shift+U style hotkey | Edge |
| Select text, press Listen bubble; paragraph play gutter | both, plus our own |
| Local engines, loopback API, pairing token | Out Loud, own addition |
| Library with progress, PDF reader, OCR prompt for scans | Speechify |

See `local-models.md` for running Kokoro-82M and Chatterbox from TypeScript.
