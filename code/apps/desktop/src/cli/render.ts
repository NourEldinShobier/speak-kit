import type { ControlRequest, Reply } from "../shared/control/contract";

type Data = Record<string, unknown>;

const lineOf = (r: { title: string; status?: string }) => `${r.title}${r.status ? ` (${r.status})` : ""}`;
const json = (d: Data) => (Object.keys(d).length ? JSON.stringify(d) : "Done.");

function speak(d: Data): string {
  const job = d.export as { path?: string } | undefined;
  if (job) return job.path ?? "Done.";
  if (Array.isArray(d.parts)) return (d.parts as string[]).join("\n");
  return d.position ? `Queued, number ${d.position}.` : "Reading.";
}

function queue(d: Data): string {
  const q = d as { current: { title: string; status: string } | null; items: { title: string }[] };
  return [q.current ? `Now: ${lineOf(q.current)}` : "Nothing is playing.", ...q.items.map((i, n) => `${n + 1}. ${i.title}`)].join("\n");
}

function history(d: Data): string {
  const rows = (d.entries as { at: number; text: string }[]) ?? [];
  return rows.length ? rows.map((e) => `${new Date(e.at).toISOString()}  ${e.text.trim()}`).join("\n") : "Nothing dictated yet.";
}

function transcribe(d: Data): string {
  const t = d.transcript as { text?: string; status: string };
  return t.text?.replace(/\s+$/, "") || "Nothing was heard in the file.";
}

const BY_COMMAND: Record<string, (d: Data) => string> = {
  speak,
  transcribe,
  queue,
  history,
  voices: (d) => (d.voices as { id: string; name: string }[]).map((v) => `${v.id === d.current ? "*" : " "} ${v.id}  ${v.name}`).join("\n"),
  status: (d) => JSON.stringify(d, null, 2),
  settings: (d) => JSON.stringify(d.settings ?? d, null, 2),
  labs: (d) => `${d.id} is ${d.on ? "on" : "off"}.`,
};

/** A reply as the lines a person reads; `dictate --print`, `speak --print` and `skill` print only their text. */
export function render(r: Reply, req: ControlRequest, print: boolean): string {
  if (!r.ok) return r.error.message;
  const d = r.data as Data;
  if (typeof d.text === "string" && (print || req.command === "skill")) return d.text.replace(/\s+$/, "");
  return (BY_COMMAND[req.command] ?? json)(d);
}
