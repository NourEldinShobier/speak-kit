# Mobbin reference notes for SpeakKit (2026-11-01)

Platform note from the owner: SpeakKit is a **Windows + macOS** product, **Windows ships first**. Designs target Windows 11 (window controls top right, tray flyout, Ctrl-based shortcuts). A macOS pass (traffic lights top left, menu-bar item instead of tray, Cmd shortcuts) comes later. Chrome extension is the same on both.

Screens inspected (all web, text-to-speech and adjacent):

| Pattern | Reference | What it does well | SpeakKit status |
|---|---|---|---|
| Text with read-along highlight, bottom player | [Hume AI editor](https://mobbin.com/screens/a5f6a2d3-d8cd-4ef6-943d-72f154345d09) | Warm peach sentence band, `short pause` markers inline, bottom bar: play, time, scrub bar, download, 1.0x speed pill, "Until end" scope picker; right panel holds Voice + Recent voices + Advanced | Our reader has band + bar, but voice/speed live only in popovers; no inline voice panel option, no "play from selection to end/paragraph" scope |
| Sentence blocks, transport bar | [ElevenLabs](https://mobbin.com/screens/879dc596-8a75-4426-8dc4-46574f7761e5) | Each sentence is its own block with a left rule; transport centered (queue, 1.0x, prev, play, next, time 0:00 / 0:57); left rail with tabs | Ours highlights one sentence only; fine for reading, but no per-sentence click-to-seek affordance shown |
| TTS playground | [OpenAI Platform](https://mobbin.com/screens/8b3e6251-1f46-4996-8885-3f69a9a56ccf) | Waveform result with play, time, download; right panel: Model, Voice, Speed slider with numeric value, Format | Our popup waveform is similar; speed slider needs a numeric readout beside it |
| Character counter, emotion list | [Mistral Studio](https://mobbin.com/screens/43648c1e-b8ed-4aba-a0bc-6961cb7742c6) | "615 / 4,000 characters" in header, voice/emotion list rows with play buttons and a check on the chosen one | Add word count and estimated time to the Add dialog (done) and library rows; voice rows need clear selected + preview affordance |
| Advanced voice controls | [PlayAI](https://mobbin.com/screens/a0a70c4b-faca-4b9e-bd0f-572c0607c7a6) | Sliders with value labels and one-line help under each | Chatterbox style dialog has sliders without numeric values |
| Voice library | [Hume AI voices](https://mobbin.com/screens/f0dcbf11-f004-479e-8f55-2f81f060a093) | Filter chips (Language, Accent, Gender, Age), flag + accent metadata column, row-level play, "Download voice preview" in overflow | Ours is a card grid; add accent flag/metadata column option and row view for 28 voices |
| Dense voice list | [Vapi](https://mobbin.com/screens/69c0ef3e-518a-4e9e-b853-011637ae9b53) | Compact grid, play on every row | Reference for list density only |
| Setup progress | [Klaviyo](https://mobbin.com/screens/a6302778-7cdc-4f61-96a8-8e4bf83aeeff) | Progress bar plus a checklist: done items checked, current item spinner, remaining items dimmed | Our download screen matches; add "what happens next" line and dimmed pending step |
| Waiting screen | [Google Workspace](https://mobbin.com/screens/1e371ae4-36c5-4162-b543-3a7a1b902759) | Honest wait note: "Leave this page open… may take a few minutes" | Add time-honesty copy to Chatterbox 2.4 GB download |
| Settings | [Linear](https://mobbin.com/screens/8720abc2-c855-44ee-911d-bc15fc1707eb) | Section heading above a bordered group, each row title + one-line description + control, consistent right alignment | Ours matches |
| Labeled toggles | [Deputy](https://mobbin.com/screens/2f8e7769-8f14-4e4a-8f9e-ad59b5b27ec4), [15Five](https://mobbin.com/screens/f9e5b8f3-f0c3-4337-b83f-a8f97470d4cf) | Toggles carry an ON/OFF text label, so state is not color alone | Ours are color-only; add on/off text or check icon for accessibility |
| Icon-led option cards | [Expensify](https://mobbin.com/screens/f6c2908a-b624-49fe-a9dd-5bfd1a470a3b) | Optional features as small cards with icon, title, description, toggle | Possible for Chatterbox extras |
| Empty library | [Mistral Libraries](https://mobbin.com/screens/37583bea-14bc-4c3f-b24e-ffd5c0b95a73), [Bloom](https://mobbin.com/screens/5336df95-8bc4-4951-8943-fab1e4afcae7), [Elicit](https://mobbin.com/screens/e5d8e943-c6f2-418c-8414-542ba852463e), [Square](https://mobbin.com/screens/a3919f0c-a620-4a40-b9d1-3aff457372cb) | One icon, one sentence, one primary button; secondary source (Zotero, Webpage) beside it; success toast bottom right ("Library updated successfully!") | Ours has three equal buttons plus three tip cards; ok but heavy, and there is no success toast after adding |

## Cross-cutting findings
1. State must never rely on color alone (toggles, status dots, grade chips).
2. Every slider should show its numeric value.
3. A success toast after add/export/pair is missing across the app.
4. Voice and speed are reachable in two places in references (inline panel and popover); ours only popovers.
5. Pair "scope of playback" ("until end", "this paragraph") is common in editors; consider for the reader.
6. Windows-first: keep Ctrl-based shortcuts, right-side window controls, tray flyout; do not show Mac-only UI.
