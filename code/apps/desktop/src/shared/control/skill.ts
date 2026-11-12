/**
 * The agent skill that teaches the command line, printed by `speakkit skill`. It names the control version and the app version it was written for,
 * so an agent that kept an old copy can tell it is stale.
 */
export function skillText(controlVersion: number, appVersion: string): string {
  return [
    "---",
    "name: speakkit",
    `description: Control Speak Kit from the command line (read text aloud, dictate, change settings). Written for Speak Kit ${appVersion}, control version ${controlVersion}.`,
    "---",
    "",
    "# Speak Kit command line",
    "",
    `This skill is pinned to Speak Kit ${appVersion} (control version ${controlVersion}). If \`speakkit capabilities --json\` reports another version, run \`speakkit skill\` again.`,
    "",
    "Every command takes `--json` and then prints one JSON object with a `version` field. Exit codes: 0 done, 1 refused or failed, 2 wrong usage, 3 Speak Kit is not running, 4 no speech heard.",
    "Only `speakkit start` launches the app. Every other command needs it running.",
    "",
    "- `speakkit status` shows dictation and reading state.",
    "- `speakkit read <text>` reads text aloud now. `speakkit pause` and `speakkit resume` control the reading.",
    "- `speakkit speak <text | file | ->` reads text or a file aloud. `--queue` waits behind what is playing, `--wait` returns when the reading is over, `--print` prints the sentences without speaking, `--out file.mp3` or `file.wav` saves audio instead.",
    "- `speakkit transcribe <file> [--language auto|en|de|ar]` transcribes an audio file, waits until it is done and prints the text. The transcript also appears in the History page.",
    "- `speakkit queue` shows what plays and what waits. `speakkit stop` stops and clears the waiting list; `--keep-queue` starts the next one. `speakkit voices` lists the voices.",
    "- `speakkit voice [id]` shows or sets the voice.",
    "- `speakkit dictate --print` records and prints the text to stdout instead of pasting it. Add `--raw` to skip text clean-up.",
    "- `speakkit dictate stop --print` ends a running recording and waits up to 60 seconds for the text.",
    "- `speakkit settings`, `speakkit settings get <key>`, `speakkit settings set <key>=<json>` read and change settings. Dictation keys start with `dictation.`.",
    "- `speakkit history [--search words] [--limit n]` lists what was dictated. It never starts the app.",
    "- `speakkit meetings list|search <words>|show <id|latest> [--from t] [--to t] [--chapter n]|chapters <id>` reads recorded meetings. Times are seconds, m:ss or h:mm:ss. `show` takes a full id, 6 or more characters of one, or `latest`. Reads never start the app and change no file.",
    "- `speakkit capture list|show <id|title|latest>` reads saved captures and what was said in them.",
    "- `speakkit labs [list]`, `speakkit labs on <id>`, `speakkit labs off <id>` turn experiments on or off.",
    "- `speakkit capabilities --json` lists what this version can do. Check it instead of comparing version numbers.",
    "",
  ].join("\n");
}

/** The app and control versions a skill file says it was written for, or undefined when the file is not one of ours. */
export function skillMark(text: string): { app: string; control: number } | undefined {
  const m = /Written for Speak Kit (\S+), control version (\d+)\./.exec(text);
  return m ? { app: m[1]!, control: Number(m[2]) } : undefined;
}

/** What an installed skill file is next to the one this app version writes. */
export function skillState(installed: string | undefined, current: string): "not-installed" | "up-to-date" | "out-of-date" {
  if (installed === undefined) return "not-installed";
  return installed === current ? "up-to-date" : "out-of-date";
}
