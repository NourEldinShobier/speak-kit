import type { CaptureRecord } from "../store";

export interface CliPorts {
  list(search?: string): Promise<CaptureRecord[]>;
  get(id: string): Promise<CaptureRecord | undefined>;
}

export interface CliResult {
  code: number;
  out: string;
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;
const wordsText = (r: CaptureRecord) => r.words?.map((w) => w.text).join(" ") ?? "";

const line = (r: CaptureRecord) => [r.id, new Date(r.at).toISOString(), r.kind, r.durationMs !== undefined ? clock(r.durationMs) : "-", r.title].join("\t");

/** `capture list [--json] [search]` and `capture show <id> [--json]`. Read only: it never starts, changes or removes a capture. */
export async function runCaptureCli(args: readonly string[], p: CliPorts): Promise<CliResult> {
  const json = args.includes("--json");
  const rest = args.filter((a) => a !== "--json");
  const [cmd, ...more] = rest;
  if (cmd === "list") {
    const items = await p.list(more.join(" ") || undefined);
    return { code: 0, out: json ? JSON.stringify(items.map(({ id, kind, title, at, durationMs }) => ({ id, kind, title, at, durationMs }))) : items.map(line).join("\n") };
  }
  if (cmd === "show") {
    const id = more[0];
    if (!id) return { code: 2, out: "Usage: capture show <id>" };
    const r = await p.get(id);
    if (!r) return { code: 1, out: `No capture with id ${id}` };
    if (json) return { code: 0, out: JSON.stringify(r) };
    return { code: 0, out: [r.title, line(r), r.words?.length ? `\n${wordsText(r)}` : ""].join("\n").trimEnd() };
  }
  return { code: 2, out: "Usage: capture list [--json] [search] | capture show <id> [--json]" };
}
