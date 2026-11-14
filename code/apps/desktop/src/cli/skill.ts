import { EXIT, exitFor, ok, type Exit, type Reply } from "../shared/control/contract";
import { skillMark, skillState } from "../shared/control/skill";
import type { Parsed } from "./parse";
import type { Io } from "./run";

/** `skill install` and `skill status`, given the skill text this app version writes (or why it could not be had). */
export async function skillAction(io: Io, p: Parsed, reply: Reply): Promise<Exit> {
  const installed = await io.readSkill();
  const say = (text: string, data: object): Exit => (io.out(p.json ? `${JSON.stringify(ok(data))}\n` : `${text}\n`), EXIT.ok);
  if (!reply.ok) {
    // Without the app there is no current text to compare with, but whether a file is there can still be said.
    if (p.skill === "status" && reply.error.code === "not-running") {
      const state = installed === undefined ? "not-installed" : "installed";
      return say(state === "installed" ? "Installed. Start Speak Kit to compare it with this version." : "Not installed. Run: speakkit skill install", { state });
    }
    io.err(p.json ? `${JSON.stringify(reply)}\n` : `${reply.error.message}\n`);
    return exitFor(reply);
  }
  const current = (reply.data as { text: string }).text;
  if (p.skill === "install") {
    const where = await io.writeSkill(current);
    return say(`Installed at ${where}`, { state: "up-to-date", where });
  }
  const state = skillState(installed, current);
  const mark = installed === undefined ? undefined : skillMark(installed);
  const text = {
    "not-installed": "Not installed. Run: speakkit skill install",
    "up-to-date": "Installed and up to date.",
    "out-of-date": `Out of date${mark ? `: the file is for Speak Kit ${mark.app}` : ""}. Run: speakkit skill install`,
  }[state];
  return say(text, { state, ...(mark && { installedFor: mark.app }) });
}
