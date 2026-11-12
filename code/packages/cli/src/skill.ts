import path from "node:path";
import { AUTOMATION_ERROR_CODES, AUTOMATION_ERROR_TEXT, AUTOMATION_LIMITS, EXIT_CODES } from "@speakkit/protocol";

const MARK = /<!--\s*speakkit-version:\s*([^\s>]+)\s*-->/;

/** The agent skill (SKILL.md) for this version. Built from the same constants as the tool, so the codes and limits it names cannot drift. */
export function skillText(version: string): string {
  return `---
name: speakkit
description: Read text aloud on this computer with the Speak Kit command line. Use it when the user asks you to read, speak, narrate or save audio of text or a file, or to stop or check what is being read.
---
<!-- speakkit-version: ${version} -->
# Speak Kit command line

Speak Kit reads text aloud with a local voice. The app must be running. Use \`--json\` whenever you parse the output.

## Commands

- \`speakkit speak "text"\` reads now and replaces what is playing. A file name reads that file; \`-\` reads standard input.
- \`speakkit speak --queue "text"\` waits behind what is playing. At most ${AUTOMATION_LIMITS.maxQueued} readings can wait.
- \`speakkit speak --print "text"\` speaks nothing and prints the sentences that would be read. Use it to preview.
- \`speakkit speak --wait "text"\` returns when everything has been read.
- \`speakkit speak notes.md --out notes.mp3\` saves audio to a file (.mp3 or .wav) instead of playing it.
- \`speakkit stop\` stops and empties the waiting list. \`--keep-queue\` goes on with the next waiting reading.
- \`speakkit status\`, \`speakkit queue\` and \`speakkit voices\` only read; they are always safe.
- \`speakkit capabilities --json\` lists what this version can do. Check it instead of guessing from the version number.

## Limits

- Text over ${AUTOMATION_LIMITS.maxTextChars.toLocaleString("en-US")} characters is refused (too_large). A file over ${AUTOMATION_LIMITS.maxFileBytes / 1024 / 1024} MiB is refused before it is read.
- Do not read secrets, tokens or passwords aloud.

## Exit codes

${EXIT_CODES.ok} done. ${EXIT_CODES.failed} failed: the error code is printed. ${EXIT_CODES.usage} wrong usage. ${EXIT_CODES.unreachable} Speak Kit is not running, or the token was rejected: ask the user to open the app.

## Error codes

${AUTOMATION_ERROR_CODES.map((c) => `- ${c}: ${AUTOMATION_ERROR_TEXT[c]}`).join("\n")}
`;
}

/** File access the skill functions need; the real one reads and writes the disk, tests use a map. */
export interface SkillFs {
  read(file: string): Promise<string | null>;
  write(file: string, text: string): Promise<void>;
}

const fileIn = (dir: string) => path.join(dir, "speakkit", "SKILL.md");

/** Writes the skill for `version` under `dir/speakkit/SKILL.md` and returns the path. */
export async function installSkill(fs: SkillFs, dir: string, version: string): Promise<string> {
  const file = fileIn(dir);
  await fs.write(file, skillText(version));
  return file;
}

export type SkillState = { state: "none" } | { state: "current" } | { state: "outdated"; installedFor: string };

/** Is the installed skill missing, for this version, or for another one (a file without the version mark counts as outdated). */
export async function skillState(fs: SkillFs, dir: string, version: string): Promise<SkillState> {
  const text = await fs.read(fileIn(dir));
  if (text === null) return { state: "none" };
  const installedFor = MARK.exec(text)?.[1];
  return installedFor === version ? { state: "current" } : { state: "outdated", installedFor: installedFor ?? "an unknown version" };
}
