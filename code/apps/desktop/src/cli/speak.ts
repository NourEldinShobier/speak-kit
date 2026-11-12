import { AUTOMATION_LIMITS } from "@speakkit/protocol";
import { fail, LIMITS, type Reply } from "../shared/control/contract";
import type { Discovery } from "../main/control/discovery";
import type { Io } from "./run";

/** The text `speak` reads: stdin for -, the file when the words name one, else the words themselves. A file over the limit is refused before it is read. */
export async function speakSource(io: Io, source: string): Promise<{ text: string } | Reply> {
  if (source === "-") return { text: await io.stdin() };
  const f = await io.file(source);
  if (f.kind === "too-large") return fail("too-large", `The file is over ${AUTOMATION_LIMITS.maxFileBytes / 1024 / 1024} MiB.`);
  return { text: f.kind === "text" ? f.text : source };
}

/** Longest an export is followed: 30 minutes of polling every 300 ms. */
const MAX_POLLS = 6000;

/** An export runs in the app; ask for its progress until it ends, then answer with the file. */
export async function followExport(io: Io, d: Discovery, first: Reply): Promise<Reply> {
  let reply = first;
  for (let i = 0; i < MAX_POLLS && reply.ok; i++) {
    const job = (reply.data as { export?: { id: string; stage: string; error?: string } }).export;
    if (!job || job.stage === "done") return reply;
    if (job.stage === "error") return fail("failed", `The export failed${job.error ? ` (${job.error})` : ""}.`);
    if (job.stage === "cancelled") return fail("cancelled", "The export was cancelled.");
    await io.sleep(300);
    reply = await io.post(d, { command: "speak", args: { exportId: job.id } }, LIMITS.timeoutMs);
  }
  return reply;
}

/** Longest `--wait` follows a reading: an hour of polling every half second. */
const MAX_WAIT_POLLS = 7200;

/** A reading that was started waits here until it and everything behind it is over; the reply of the start is what the command answers with. */
export async function followReading(io: Io, d: Discovery, started: Reply): Promise<Reply> {
  for (let i = 0; i < MAX_WAIT_POLLS; i++) {
    await io.sleep(500);
    const q = await io.post(d, { command: "queue", args: {} }, LIMITS.timeoutMs);
    if (!q.ok) return q;
    const { current, items } = q.data as { current: { status: string } | null; items: unknown[] };
    if ((!current || ["idle", "finished", "error"].includes(current.status)) && items.length === 0) return started;
  }
  return started;
}
