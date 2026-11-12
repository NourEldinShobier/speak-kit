import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { fail, ok, type ControlRequest, type Reply } from "../shared/control/contract";
import type { Discovery } from "../main/control/discovery";
import { registerExperiment } from "../shared/settings/experiments";
import { parseArgs, render, runCli, type FileRead, type Io } from "./run";
import type { MeetingsSource } from "./reads/meetings";

const RUNNING: Discovery = { port: 4000, token: "t".repeat(32), pid: 1, version: "0.5.3" };

function rig(over: { replies?: Reply[]; files?: Record<string, FileRead>; config?: unknown; skill?: string; meetings?: MeetingsSource; running?: boolean } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const sent: ControlRequest[] = [];
  const replies = [...(over.replies ?? [])];
  let slept = 0;
  const written: string[] = [];
  const io: Io = {
    out: (t) => void out.push(t),
    err: (t) => void err.push(t),
    discovery: async () => (over.running === false ? null : RUNNING),
    launch: async () => true,
    offlineHistory: async () => null,
    reads: { meetings: async () => over.meetings ?? { entries: [], transcript: async () => [], notes: async () => [] }, captures: async () => ({ records: [], root: "" }) },
    readConfig: async () => over.config,
    file: async (p) => over.files?.[p] ?? { kind: "none" },
    post: async (_d, req) => (sent.push(req), replies.shift() ?? ok({})),
    stdin: async () => "from stdin",
    sleep: async () => void slept++,
    readSkill: async () => over.skill,
    writeSkill: async (t) => (written.push(t), "C:/skills/SKILL.md"),
  };
  return { io, out, err, sent, written, slept: () => slept };
}
const run = (argv: string[], r = rig()) => runCli(argv, r.io);

describe("speak", () => {
  it("turns its words and flags into one request", () => {
    expect(parseArgs(["speak", "hello", "there", "--queue"]).request).toEqual({ command: "speak", args: { source: "hello there", queue: true } });
    expect(parseArgs(["speak", "a.md", "--print"]).request).toEqual({ command: "speak", args: { source: "a.md", print: true } });
    expect(parseArgs(["speak", "a.md", "--out", "a.mp3"]).request).toEqual({ command: "speak", args: { source: "a.md", out: "a.mp3" } });
  });

  it("reads a file named by the words, and sends the words themselves when no file has that name", async () => {
    const r = rig({ files: { "notes.md": { kind: "text", text: "From the file." } } });
    expect(await run(["speak", "notes.md"], r)).toBe(0);
    expect(await run(["speak", "plain", "words"], r)).toBe(0);
    expect(r.sent).toEqual([
      { command: "speak", args: { text: "From the file." } },
      { command: "speak", args: { text: "plain words" } },
    ]);
  });

  it("reads standard input for a dash", async () => {
    const r = rig();
    await run(["speak", "-", "--queue"], r);
    expect(r.sent).toEqual([{ command: "speak", args: { queue: true, text: "from stdin" } }]);
  });

  it("refuses a file over the limit before sending anything", async () => {
    const r = rig({ files: { "big.txt": { kind: "too-large" } } });
    expect(await run(["--json", "speak", "big.txt"], r)).toBe(1);
    expect(JSON.parse(r.out.join(""))).toMatchObject({ ok: false, error: { code: "too-large", message: "The file is over 64 MiB." } });
    expect(r.sent).toEqual([]);
  });

  it("prints the sentences one per line for --print", async () => {
    const r = rig({ replies: [ok({ id: "", position: 0, sentences: 2, estimatedMs: 10, parts: ["One.", "Two."] })] });
    await run(["speak", "One. Two.", "--print"], r);
    expect(r.out.join("")).toBe("One.\nTwo.\n");
  });

  it("starts an export with an absolute path, follows it and prints the file", async () => {
    const r = rig({
      replies: [
        ok({ export: { id: "e1", stage: "rendering", progress: 0 } }),
        ok({ export: { id: "e1", stage: "encoding", progress: 0.5 } }),
        ok({ export: { id: "e1", stage: "done", progress: 1, path: "C:\\a.mp3" } }),
      ],
    });
    expect(await run(["speak", "Save this", "--out", "a.mp3"], r)).toBe(0);
    expect(r.sent).toEqual([
      { command: "speak", args: { text: "Save this", out: path.resolve("a.mp3") } },
      { command: "speak", args: { exportId: "e1" } },
      { command: "speak", args: { exportId: "e1" } },
    ]);
    expect(r.slept()).toBe(2);
    expect(r.out.join("")).toBe("C:\\a.mp3\n");
  });

  it("reports a failed or cancelled export and a refusal at the start", async () => {
    const failed = rig({ replies: [ok({ export: { id: "e", stage: "error", progress: 0, error: "disk-full" } })] });
    expect(await run(["--json", "speak", "x", "--out", "a.wav"], failed)).toBe(1);
    expect(JSON.parse(failed.out.join(""))).toMatchObject({ error: { code: "failed", message: "The export failed (disk-full)." } });
    const cancelled = rig({ replies: [ok({ export: { id: "e", stage: "cancelled", progress: 0 } })] });
    await run(["--json", "speak", "x", "--out", "a.wav"], cancelled);
    expect(JSON.parse(cancelled.out.join(""))).toMatchObject({ error: { code: "cancelled" } });
    const refused = rig({ replies: [fail("model-missing", "The speech model is not downloaded yet.")] });
    expect(await run(["speak", "x", "--out", "a.wav"], refused)).toBe(1);
    expect(refused.err.join("")).toBe("The speech model is not downloaded yet.\n");
  });

  it("fails with a timeout, not success, when an export is still running after 30 minutes", async () => {
    const running = ok({ export: { id: "e", stage: "encoding", progress: 0.5 } });
    const r = rig({ replies: Array.from({ length: 6001 }, () => running) });
    expect(await run(["--json", "speak", "x", "--out", "a.mp3"], r)).toBe(1);
    expect(JSON.parse(r.out.join(""))).toMatchObject({ ok: false, error: { code: "timeout" } });
  });

  it("says queued with the place, and exits 3 when the app is not running", async () => {
    const r = rig({ replies: [ok({ id: "a", position: 2, sentences: 1, estimatedMs: 1 }), ok({ id: "b", position: 0, sentences: 1, estimatedMs: 1 })] });
    await run(["speak", "x", "--queue"], r);
    await run(["speak", "y"], r);
    expect(r.out.join("")).toBe("Queued, number 2.\nReading.\n");
    expect(await run(["speak", "x"], rig({ running: false }))).toBe(3);
  });
});

describe("queue, voices and stop", () => {
  it("prints the queue and the voices", () => {
    expect(render(ok({ current: { title: "Intro", status: "playing" }, items: [{ title: "Next one" }] }), { command: "queue", args: {} }, false)).toBe("Now: Intro (playing)\n1. Next one");
    expect(render(ok({ current: null, items: [] }), { command: "queue", args: {} }, false)).toBe("Nothing is playing.");
    expect(
      render(
        ok({
          voices: [
            { id: "a", name: "Ann" },
            { id: "b", name: "Bo" },
          ],
          current: "b",
        }),
        { command: "voices", args: {} },
        false,
      ),
    ).toBe("  a  Ann\n* b  Bo");
  });
  it("stop can keep the waiting list", () => {
    expect(parseArgs(["stop"]).request).toEqual({ command: "stop", args: {} });
    expect(parseArgs(["stop", "--keep-queue"]).request).toEqual({ command: "stop", args: { keepQueue: true } });
    expect(parseArgs(["queue"]).request).toEqual({ command: "queue", args: {} });
    expect(parseArgs(["voices"]).request).toEqual({ command: "voices", args: {} });
  });
});

describe("meetings and capture commands", () => {
  const meetings: MeetingsSource = {
    entries: [
      {
        id: "abcdef1",
        title: "Planning",
        titleTemporary: false,
        providerId: "z",
        providerName: "Zoom",
        startedAt: 0,
        durationSec: 90,
        status: "done",
        audio: { you: 0, them: 0 },
        notes: { state: "off", chapters: 0 },
        exports: [],
      },
    ],
    transcript: async () => [{ start: 5, end: 9, text: "hello", who: "You" }],
    notes: async () => [],
  };

  it("parses ranges, chapters and limits", () => {
    expect(parseArgs(["meetings", "show", "latest", "--from", "1:00", "--to", "2:00"]).read).toEqual({ command: "meetings", action: "show", ref: "latest", from: 60, to: 120 });
    expect(parseArgs(["meetings", "show", "abcdef", "--chapter", "2"]).read).toEqual({ command: "meetings", action: "show", ref: "abcdef", chapter: 2 });
    expect(parseArgs(["meetings", "search", "budget", "review", "--limit", "5"]).read).toEqual({ command: "meetings", action: "search", query: "budget review", limit: 5 });
    expect(parseArgs(["meetings"]).read).toEqual({ command: "meetings", action: "list" });
    expect(parseArgs(["capture", "show", "latest"]).read).toEqual({ command: "capture", action: "show", ref: "latest" });
  });

  it("names what is wrong with a time, a chapter or a limit", () => {
    for (const [argv, usage] of [
      [["meetings", "show", "x", "--from", "soon"], "--from takes seconds, m:ss or h:mm:ss."],
      [["meetings", "show", "x", "--to", "1:99"], "--to takes seconds, m:ss or h:mm:ss."],
      [["meetings", "show", "x", "--chapter", "0"], "--chapter takes a whole number above 0."],
      [["meetings", "list", "--limit", "x"], "--limit takes a whole number above 0."],
      [["meetings", "show", "x", "--chapter", "1", "--from", "5"], "Use --chapter or --from and --to, not both."],
      [["labs", "on"], "Use: labs list, labs on <id> or labs off <id>."],
    ] as const)
      expect(parseArgs(argv).usage).toBe(usage);
  });

  it("answers from the files even when the app is not running, and never calls it", async () => {
    const r = rig({ meetings, running: false });
    expect(await run(["meetings", "show", "latest", "--from", "0:04"], r)).toBe(0);
    expect(r.out.join("")).toContain("[00:05] You: hello");
    expect(await run(["--json", "meetings", "list"], r)).toBe(0);
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ ok: true, version: 1, data: { meetings: [{ id: "abcdef1", title: "Planning" }] } });
    expect(r.sent).toEqual([]);
  });

  it("exits 1 with the sentence for a meeting that is not there and 2 for a missing one", async () => {
    const r = rig({ meetings });
    expect(await run(["meetings", "show", "zzzzzz"], r)).toBe(1);
    expect(r.err.join("")).toBe('No meeting has the id "zzzzzz".\n');
    expect(await run(["meetings", "show"], r)).toBe(2);
  });
});

describe("labs", () => {
  it("lists the experiments everyone sees with what the settings file says, and sends on and off to the app", async () => {
    registerExperiment({ id: "cli-test-lab", title: "A test lab", summary: "s", warning: "w", group: "Test", audience: "everyone", graduation: "g" });
    const r = rig({ config: { experiments: { "cli-test-lab": true, "caption-export": true } }, running: false });
    expect(await run(["--json", "labs"], r)).toBe(0);
    expect(JSON.parse(r.out.join("")).data.labs).toEqual([{ id: "cli-test-lab", title: "A test lab", group: "Test", on: true }]);
    const text = rig({ running: false });
    await run(["labs", "list"], text);
    expect(text.out.join("")).toBe("off  cli-test-lab  A test lab\n");
    const on = rig({ replies: [ok({ id: "caption-export", on: true })] });
    await run(["labs", "on", "caption-export"], on);
    expect(on.sent).toEqual([{ command: "labs", args: { id: "caption-export", on: true } }]);
    expect(on.out.join("")).toBe("caption-export is on.\n");
    const off = rig();
    await run(["labs", "off", "x"], off);
    expect(off.sent).toEqual([{ command: "labs", args: { id: "x", on: false } }]);
  });
  it("is not changed while the app is closed", async () => {
    expect(await run(["labs", "on", "x"], rig({ running: false }))).toBe(3);
  });
});

describe("speak --wait", () => {
  const playing = ok({ current: { title: "x", status: "playing" }, items: [] });
  const over = ok({ current: { title: "x", status: "finished" }, items: [] });
  it("returns when the reading and everything behind it is over", async () => {
    const r = rig({ replies: [ok({ id: "a", position: 0, sentences: 1, estimatedMs: 1 }), playing, ok({ current: null, items: [{ title: "next" }] }), over] });
    expect(await run(["speak", "hello", "--wait"], r)).toBe(0);
    expect(r.sent.map((s) => s.command)).toEqual(["speak", "queue", "queue", "queue"]);
    expect(r.slept()).toBe(3);
    expect(r.out.join("")).toBe("Reading.\n");
  });
  it("does not wait for a print or an export, or when the start was refused", async () => {
    const print = rig({ replies: [ok({ id: "", position: 0, sentences: 1, estimatedMs: 1, parts: ["x"] })] });
    await run(["speak", "x", "--print", "--wait"], print);
    expect(print.sent.length).toBe(1);
    const refused = rig({ replies: [fail("busy", "Busy.")] });
    expect(await run(["speak", "x", "--wait"], refused)).toBe(1);
    expect(refused.sent.length).toBe(1);
  });
  it("exits 1 when the reading ends in an error, and when it is still going after an hour", async () => {
    const start = ok({ id: "a", position: 0, sentences: 1, estimatedMs: 1 });
    const broken = rig({ replies: [start, ok({ current: { title: "x", status: "error" }, items: [] })] });
    expect(await run(["--json", "speak", "x", "--wait"], broken)).toBe(1);
    expect(JSON.parse(broken.out.join(""))).toMatchObject({ ok: false, error: { code: "failed", message: "The reading failed." } });
    const endless = rig({ replies: [start, ...Array.from({ length: 7200 }, () => playing)] });
    expect(await run(["--json", "speak", "x", "--wait"], endless)).toBe(1);
    expect(JSON.parse(endless.out.join(""))).toMatchObject({ error: { code: "timeout" } });
  });
  it("stops waiting and says why when the queue cannot be read", async () => {
    const r = rig({ replies: [ok({ id: "a", position: 0, sentences: 1, estimatedMs: 1 }), fail("timeout", "Slow.")] });
    expect(await run(["speak", "x", "--wait"], r)).toBe(1);
    expect(r.err.join("")).toBe("Slow.\n");
  });
});

describe("capabilities and skill without the app", () => {
  it("capabilities answers from this build while the app is closed", async () => {
    const r = rig({ running: false });
    expect(await run(["--json", "capabilities"], r)).toBe(0);
    expect(JSON.parse(r.out.join(""))).toMatchObject({ ok: true, data: { app: null, features: { meetings: true, speak: true }, commands: expect.arrayContaining(["speak", "meetings", "capture"]) } });
  });
  it("skill status says whether a file is there, and install needs the app", async () => {
    const none = rig({ running: false });
    await run(["skill", "status"], none);
    expect(none.out.join("")).toBe("Not installed. Run: speakkit skill install\n");
    const some = rig({ running: false, skill: "x" });
    await run(["--json", "skill", "status"], some);
    expect(JSON.parse(some.out.join(""))).toMatchObject({ data: { state: "installed" } });
    expect(await run(["skill", "install"], rig({ running: false }))).toBe(3);
  });
});

describe("skill", () => {
  const text = "---\ndescription: x Written for Speak Kit 0.5.3, control version 1.\n---\n";
  it("prints the text by default and with print, and refuses an unknown action", async () => {
    for (const argv of [["skill"], ["skill", "print"]]) {
      const r = rig({ replies: [ok({ text })] });
      await run(argv, r);
      expect(r.out.join("")).toBe(`${text.trimEnd()}\n`);
    }
    expect(parseArgs(["skill", "fly"]).usage).toBe("Use: skill, skill print, skill install or skill status.");
    expect(parseArgs(["skill", "install", "now"]).usage).toBe("Use: skill, skill print, skill install or skill status.");
  });
  it("install writes the text the app gave", async () => {
    const r = rig({ replies: [ok({ text })] });
    expect(await run(["skill", "install"], r)).toBe(0);
    expect(r.written).toEqual([text]);
    expect(r.out.join("")).toBe("Installed at C:/skills/SKILL.md\n");
  });
  it("status says up to date, out of date with the version in the file, or not installed", async () => {
    const same = rig({ replies: [ok({ text })], skill: text });
    await run(["skill", "status"], same);
    expect(same.out.join("")).toBe("Installed and up to date.\n");
    const old = rig({ replies: [ok({ text })], skill: "Written for Speak Kit 0.4.0, control version 1." });
    await run(["--json", "skill", "status"], old);
    expect(JSON.parse(old.out.join(""))).toMatchObject({ data: { state: "out-of-date", installedFor: "0.4.0" } });
    const plain = rig({ replies: [ok({ text })], skill: "old text" });
    await run(["skill", "status"], plain);
    expect(plain.out.join("")).toBe("Out of date. Run: speakkit skill install\n");
    const none = rig({ replies: [ok({ text })] });
    await run(["skill", "status"], none);
    expect(none.out.join("")).toBe("Not installed. Run: speakkit skill install\n");
  });
  it("passes a failure of the app on with its exit code", async () => {
    const r = rig({ replies: [fail("timeout", "Slow.")] });
    expect(await run(["skill", "install"], r)).toBe(1);
    expect(r.err.join("")).toBe("Slow.\n");
  });
});
