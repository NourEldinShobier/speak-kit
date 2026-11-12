import * as captures from "./captures";
import * as meetings from "./meetings";
import type { Sources } from "./disk";

export { diskSources, type Sources } from "./disk";
export { parseOffset } from "./time";

/** A read of meetings or captures. Every field but `command` and `action` depends on the action. */
export interface ReadRequest {
  command: "meetings" | "capture";
  action: string;
  /** An id, a prefix of one, `latest` or (captures) a title. */
  ref?: string;
  query?: string;
  from?: number;
  to?: number;
  chapter?: number;
  limit?: number;
}

export type ReadOutcome = { ok: true; data: unknown; text: string } | { ok: false; code: "usage" | "failed"; message: string };

const usage = (message: string): ReadOutcome => ({ ok: false, code: "usage", message });

async function readMeetings(r: ReadRequest, src: Sources): Promise<ReadOutcome> {
  const source = await src.meetings();
  if (r.action === "list") {
    const rows = meetings.list(source.entries, r.limit);
    return { ok: true, data: { meetings: rows }, text: meetings.listMarkdown(rows) };
  }
  if (r.action === "search") {
    if (!r.query?.trim()) return usage("meetings search needs words to look for.");
    const hits = await meetings.search(source, r.query, r.limit);
    return { ok: true, data: { hits }, text: meetings.searchMarkdown(hits) };
  }
  if (r.action !== "show" && r.action !== "chapters") return usage(`Unknown meetings command "${r.action}". Use list, show, chapters or search.`);
  if (!r.ref) return usage(`meetings ${r.action} needs a meeting: an id, 6 or more characters of one, or latest.`);
  const found = meetings.pick(source.entries, r.ref);
  if (!found.ok) return { ok: false, code: "failed", message: found.message };
  const shown = await meetings.show(source, found.entry, {
    ...(r.from !== undefined && { from: r.from }),
    ...(r.to !== undefined && { to: r.to }),
    ...(r.chapter !== undefined && { chapter: r.chapter }),
  });
  if (!shown.ok) return { ok: false, code: "failed", message: shown.message };
  return r.action === "chapters"
    ? { ok: true, data: { id: shown.shown.id, chapters: shown.shown.chapters }, text: meetings.chaptersMarkdown(shown.shown) }
    : { ok: true, data: { meeting: shown.shown }, text: meetings.showMarkdown(shown.shown) };
}

async function readCaptures(r: ReadRequest, src: Sources): Promise<ReadOutcome> {
  const { records, root } = await src.captures();
  if (r.action === "list") {
    const rows = captures.list(records, r.limit);
    return { ok: true, data: { captures: rows }, text: captures.listText(rows) };
  }
  if (r.action !== "show") return usage(`Unknown capture command "${r.action}". Use list or show.`);
  if (!r.ref) return usage("capture show needs a capture: an id, a title or latest.");
  const found = captures.pick(records, r.ref);
  if (!found.ok) return { ok: false, code: "failed", message: found.message };
  const shown = captures.show(found.record, root);
  return { ok: true, data: { capture: shown }, text: captures.showText(shown) };
}

/** Answers a read from the files in the data folder. Never starts the app, loads no model and changes no file. */
export async function runRead(r: ReadRequest, src: Sources): Promise<ReadOutcome> {
  try {
    return await (r.command === "meetings" ? readMeetings(r, src) : readCaptures(r, src));
  } catch (e) {
    // A file that cannot be read (locked, damaged, a folder where a file should be) is a failed read, never an empty one and never a crash.
    return { ok: false, code: "failed", message: `The saved ${r.command === "meetings" ? "meetings" : "captures"} could not be read${e instanceof Error && e.message ? ` (${e.message})` : ""}.` };
  }
}
