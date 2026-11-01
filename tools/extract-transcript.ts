// Extract a text-only, per-day transcript from a Claude Code session .jsonl.
// Usage: bun extract-transcript.ts <session.jsonl> <outDir> <title>
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const [src, outDir, title = "Chat"] = process.argv.slice(2);
if (!src || !outDir) throw new Error("usage: <session.jsonl> <outDir> [title]");
mkdirSync(outDir, { recursive: true });

const days = new Map<string, string[]>();
const stats = { lines: 0, user: 0, assistant: 0, skipped: 0 };

function textOf(msg: any): string {
  const c = msg?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n");
}

// System noise injected into user turns: reminders, hook output, tool results.
const NOISE = /^(<system-reminder>|<command-(name|message)>|Caveat:|<local-command|<user-prompt-submit-hook)/;

const rl = createInterface({ input: createReadStream(src, { encoding: "utf8" }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  stats.lines++;
  let o: any;
  try { o = JSON.parse(line); } catch { continue; }
  if (o.type !== "user" && o.type !== "assistant") continue;
  if (o.isMeta) continue;
  if (o.type === "user" && Array.isArray(o.message?.content) && o.message.content.some((b: any) => b?.type === "tool_result")) continue;

  let text = textOf(o.message).trim();
  if (!text) { stats.skipped++; continue; }
  // strip system-reminder blocks that ride along with real user text
  text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
  if (!text || NOISE.test(text)) { stats.skipped++; continue; }

  const ts = new Date(o.timestamp);
  const day = o.timestamp.slice(0, 10);
  const hhmm = ts.toISOString().slice(11, 16);
  const role = o.type === "user" ? "## USER" : "### ASSISTANT";
  if (o.type === "user") stats.user++; else stats.assistant++;
  if (!days.has(day)) days.set(day, []);
  days.get(day)!.push(`\n${role} · ${day} ${hhmm}\n\n${text}\n`);
}

for (const [day, parts] of [...days].sort()) {
  const header = `# ${title} · ${day}\n\nText only: user messages and assistant replies. Tool calls and results are left out.\n`;
  writeFileSync(join(outDir, `${day}.md`), header + parts.join("\n"), "utf8");
}
console.log(JSON.stringify({ ...stats, days: [...days.keys()].sort() }, null, 2));
