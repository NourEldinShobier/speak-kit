import { createMeetings, DEFAULT_RETENTION, type Meetings, type MeetingsDeps } from "../src";
import { MemFs, clock, tone } from "./fakes";

export function setup(o: Partial<MeetingsDeps> & { texts?: string[] } = {}) {
  const fs = (o as { fs?: MemFs }).fs ?? new MemFs();
  const c = clock(new Date(2026, 10, 3, 14, 5).getTime());
  const texts = o.texts ?? [];
  const calls = { changed: 0, transcribe: 0 };
  let n = 0;
  const deps: MeetingsDeps = {
    dir: "/meetings",
    fs,
    now: c.now,
    newId: () => `m${++n}`,
    sleep: c.sleep,
    transcribe: async () => {
      calls.transcribe++;
      const text = texts.shift();
      return text === undefined ? { ok: false, code: "failed" } : { ok: true, text, speech: true };
    },
    busy: () => false,
    retention: () => DEFAULT_RETENTION,
    notes: () => undefined,
    vocabulary: () => [],
    language: () => "en",
    headphones: () => false,
    exportDir: () => "/out",
    changed: () => calls.changed++,
    ...o,
  };
  return { fs, c, calls, deps, open: () => createMeetings(deps) };
}

export async function record(m: Meetings, c: ReturnType<typeof clock>, secs = 3) {
  const b = await m.begin({ providerId: "zoom", providerName: "Zoom" });
  if (!b.ok) throw new Error("begin");
  await m.append(b.id, "you", tone(secs), 0);
  await m.append(b.id, "them", tone(secs), 0);
  c.advance(secs * 1000);
  const e = await m.end(b.id);
  return { id: b.id, e };
}

export const settled = async (m: Meetings, id: string, until: (s: string) => boolean = (s) => s === "done" || s === "failed" || s === "interrupted") => {
  for (let i = 0; i < 200; i++) {
    const g = (await m.get(id))!;
    if (until(g.status) && g.notes.state !== "writing") return g;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("did not settle");
};
