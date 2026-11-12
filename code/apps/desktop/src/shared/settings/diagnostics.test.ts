import { describe, expect, it } from "vite-plus/test";
import type { Activity } from "../ipc";
import { activityRow, buildReport, filterActivity, logDelta, redactReport, tailLines, type ReportInput } from "./diagnostics";

const ctx = { home: "C:\\Users\\Jane", user: "Jane" };

describe("redaction", () => {
  it("replaces the home folder in every slash form and the user name", () => {
    expect(redactReport("C:\\Users\\Jane\\AppData\\x and C:/Users/Jane/y by Jane", ctx)).toBe("~\\AppData\\x and ~/y by user");
  });

  it("removes keys, tokens, e-mail addresses and bearer headers", () => {
    const text = "key sk-abcdefghijk1234 token " + "a".repeat(64) + " mail jane@example.com Authorization: Bearer abc.def";
    expect(redactReport(text)).toBe("key [key removed] token [token removed] mail [email removed] Authorization: Bearer [removed]");
  });

  it("leaves ordinary text and short hex alone, and a short user name is not replaced", () => {
    expect(redactReport("port 47615 id deadbeef", { user: "ab" })).toBe("port 47615 id deadbeef");
  });
});

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  version: "0.2.0",
  platform: "win32",
  arch: "x64",
  osVersion: "10.0.26300",
  cpu: "Test CPU",
  cores: 8,
  ramGb: 16,
  packaged: true,
  engine: "ready",
  listener: "listening on 47615",
  updateChannel: "stable",
  settings: { idleUnload: "5", batterySaver: true },
  activity: [],
  logTail: [],
  ...over,
});

describe("report", () => {
  it("lists version, system, settings and says when there is nothing to show", () => {
    const r = buildReport(input());
    expect(r).toContain("Speak Kit 0.2.0 (installed, channel stable)");
    expect(r).toContain("System: win32 x64, 10.0.26300");
    expect(r).toContain("  idleUnload: 5");
    expect(r).toContain("Recent activity\n  none");
    expect(r).toContain("Log (last lines)\n  empty");
  });

  it("redacts the whole text, including log lines", () => {
    const r = buildReport(input({ logTail: ["opened C:\\Users\\Jane\\x.txt"], activity: [{ atMs: 0, kind: "error", title: "Failed", body: "mail me at a@b.co" }] }), ctx);
    expect(r).not.toContain("Jane");
    expect(r).not.toContain("a@b.co");
    expect(r).toContain("1970-01-01T00:00:00.000Z error: Failed - mail me at [email removed]");
  });

  it("keeps at most 20 activity lines and 40 log lines", () => {
    const activity = Array.from({ length: 30 }, (_, i) => ({ atMs: i, kind: "info" as const, title: `t${i}`, body: "" }));
    const r = buildReport(input({ activity, logTail: Array.from({ length: 100 }, (_, i) => `line${i}`) }));
    expect(r).toContain("t29");
    expect(r).not.toContain("info: t9");
    expect(r).toContain("line99");
    expect(r).not.toContain("line59");
  });
});

const act = (id: number, kind: Activity["kind"], atMs: number): Activity => ({ id, kind, atMs, title: `a${id}`, body: "" });

describe("activity log", () => {
  const list = [act(1, "info", 10), act(2, "error", 30), act(3, "update", 20), act(4, "error", 5)];
  it("filters by kind and sorts newest first", () => {
    expect(filterActivity(list, "all").map((a) => a.id)).toEqual([2, 3, 1, 4]);
    expect(filterActivity(list, "errors").map((a) => a.id)).toEqual([2, 4]);
    expect(filterActivity(list, "exports")).toEqual([]);
  });

  it("writes a plain row", () => {
    expect(activityRow({ ...act(1, "error", 0), body: "Engine stopped" })).toEqual({ title: "a1", detail: "Problem: Engine stopped" });
    expect(activityRow(act(1, "pair", 0))).toEqual({ title: "a1", detail: "Browser" });
  });
});

describe("log reader", () => {
  it("does not read again until the file grows", () => {
    let reads = 0;
    const read = () => (reads++, ["x"]);
    const a = logDelta({ size: 0, lines: [] }, 10, read);
    expect(a).toEqual({ size: 10, lines: ["x"] });
    expect(logDelta(a, 10, read)).toBe(a);
    expect(reads).toBe(1);
    expect(logDelta(a, 4, read).size).toBe(4); // rotated: read again
    expect(reads).toBe(2);
  });

  it("keeps the last lines and drops a cut first line", () => {
    expect(tailLines("a\nb\r\nc\n\nd", 2)).toEqual(["c", "d"]);
    expect(tailLines("cut\nb\nc", 5, true)).toEqual(["b", "c"]);
    expect(tailLines("", 5)).toEqual([]);
  });
});
