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
    "- `speakkit read <text>` reads text aloud. `speakkit pause`, `speakkit resume` and `speakkit stop` control the reading.",
    "- `speakkit voice [id]` shows or sets the voice.",
    "- `speakkit dictate --print` records and prints the text to stdout instead of pasting it. Add `--raw` to skip text clean-up.",
    "- `speakkit dictate stop --print` ends a running recording and waits up to 60 seconds for the text.",
    "- `speakkit settings`, `speakkit settings get <key>`, `speakkit settings set <key>=<json>` read and change settings. Dictation keys start with `dictation.`.",
    "- `speakkit history [--search words] [--limit n]` lists what was dictated. It never starts the app.",
    "- `speakkit capabilities --json` lists what this version can do. Check it instead of comparing version numbers.",
    "",
  ].join("\n");
}
