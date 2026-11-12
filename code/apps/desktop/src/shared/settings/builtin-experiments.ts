import { registerExperiment } from "./experiments";

// Features that are designed but not built yet. Developers see them; the flag is stored, nothing reads it yet.
registerExperiment({
  id: "live-dictation-preview",
  title: "Live dictation preview",
  summary: "Shows your words while you are still holding the key, before the final text is inserted.",
  warning: "Text can change as you keep talking.",
  group: "Dictation",
  audience: "dev",
  graduation: "Becomes a Dictation setting after two releases without a reported problem.",
});
registerExperiment({
  id: "pause-shortcuts-in-apps",
  title: "Pause shortcuts in chosen apps",
  summary: "Turns the Speak Kit keys off while a game or remote desktop app is in front.",
  warning: "Reads the name of the front app. It never reads what is in the window.",
  group: "Shortcuts",
  audience: "dev",
  needsRestart: true,
  graduation: "Moves to the Shortcuts page once it works on both Windows and macOS.",
});
registerExperiment({
  id: "caption-export",
  title: "Caption export",
  summary: "Saves a reading as a subtitle file (.srt) or a caption file (.vtt).",
  warning: "Timings are estimated and can drift by half a second on long texts.",
  group: "Read",
  audience: "dev",
  graduation: "Joins the export dialog when timings come from the engine instead of an estimate.",
});
