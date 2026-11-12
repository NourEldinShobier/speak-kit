import { describe, expect, it } from "vite-plus/test";
import type { Activity } from "../ipc";
import { ACTIVITY_FILTERS, activityRow, buildReport, filterActivity, redactReport, tailLines, type ReportInput } from "./diagnostics";

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

describe("log tail", () => {
  it("keeps the last lines and drops a cut first line", () => {
    expect(tailLines("a\nb\r\nc\n\nd", 2)).toEqual(["c", "d"]);
    expect(tailLines("cut\nb\nc", 5, true)).toEqual(["b", "c"]);
    expect(tailLines("", 5)).toEqual([]);
  });
});

describe("redaction edge cases", () => {
  it("replaces a home folder written with forward slashes only, in any letter case", () => {
    expect(redactReport("c:/users/jane/x and C:/USERS/JANE/y", { home: "C:/Users/Jane" })).toBe("~/x and ~/y");
  });

  it("replaces a home folder written with backslashes when the home is given with slashes", () => {
    expect(redactReport("C:\\Users\\Jane\\x", { home: "C:/Users/Jane" })).toBe("~\\x");
  });

  it("replaces the user name as a whole word only and not a 2-letter name", () => {
    expect(redactReport("Janet and jane and JANE.", { user: "Jane" })).toBe("Janet and user and user.");
    expect(redactReport("Jo and Joe", { user: "Joe" })).toBe("Jo and user");
    expect(redactReport("Jo", { user: "Jo" })).toBe("Jo");
  });

  it("removes an e-mail address with a long domain, whole", () => {
    expect(redactReport("a.b+c@mail.example.co.uk!")).toBe("[email removed]!");
  });

  it("removes a bearer value after any run of spaces", () => {
    expect(redactReport("Bearer    secret.value")).toBe("Bearer [removed]");
    expect(redactReport("bearer lowercase stays")).toBe("bearer lowercase stays");
  });

  it("removes a key that uses an underscore or a dash", () => {
    expect(redactReport("ek_abcdefgh12 and sk-abcdefgh12")).toBe("[key removed] and [key removed]");
  });
});

describe("report text", () => {
  const full: ReportInput = {
    version: "1.2.3",
    platform: "darwin",
    arch: "arm64",
    osVersion: "24.1",
    cpu: "Apple M3",
    cores: 8,
    ramGb: 16,
    packaged: false,
    engine: "Ready",
    listener: "listening on port 5",
    updateChannel: "early",
    settings: { idleUnload: "5", batterySaver: true },
    activity: [
      { atMs: 0, kind: "error", title: "Broke", body: "Detail" },
      { atMs: 1000, kind: "info", title: "Fine", body: "" },
    ],
    logTail: ["l1", "l2"],
  };

  it("is exactly this text", () => {
    expect(buildReport(full)).toBe(
      [
        "Speak Kit 1.2.3 (from source, channel early)",
        "System: darwin arm64, 24.1",
        "Hardware: Apple M3, 8 cores, 16 GB memory",
        "Voice engine: Ready",
        "Listener: listening on port 5",
        "",
        "Settings",
        "  idleUnload: 5",
        "  batterySaver: true",
        "",
        "Recent activity",
        "  1970-01-01T00:00:00.000Z error: Broke - Detail",
        "  1970-01-01T00:00:01.000Z info: Fine",
        "",
        "Log (last lines)",
        "  l1",
        "  l2",
      ].join("\n"),
    );
  });

  it("an installed build says installed", () => {
    expect(buildReport({ ...full, packaged: true }).split("\n")[0]).toBe("Speak Kit 1.2.3 (installed, channel early)");
  });
});

describe("filters and rows", () => {
  it("offers these four filters in this order", () => {
    expect(ACTIVITY_FILTERS).toEqual([
      { id: "all", label: "All" },
      { id: "errors", label: "Errors" },
      { id: "updates", label: "Updates" },
      { id: "exports", label: "Exports" },
    ]);
  });

  it("each filter keeps only its own kind", () => {
    const mk = (id: number, kind: Activity["kind"]): Activity => ({ id, kind, atMs: id, title: "", body: "" });
    const all = [mk(1, "error"), mk(2, "update"), mk(3, "export"), mk(4, "info"), mk(5, "pair"), mk(6, "reading")];
    expect(filterActivity(all, "updates").map((a) => a.kind)).toEqual(["update"]);
    expect(filterActivity(all, "exports").map((a) => a.kind)).toEqual(["export"]);
    expect(filterActivity(all, "errors").map((a) => a.kind)).toEqual(["error"]);
    expect(filterActivity(all, "all")).toHaveLength(6);
  });

  it("names every kind in the detail", () => {
    const row = (kind: Activity["kind"]) => activityRow({ id: 1, atMs: 0, kind, title: "t", body: "b" }).detail;
    expect(["error", "pair", "info", "export", "update", "reading"].map((k) => row(k as Activity["kind"]))).toEqual(["Problem: b", "Browser: b", "Note: b", "Export: b", "Update: b", "Reading: b"]);
  });

  it("a text read without a cut line keeps its first line", () => {
    expect(tailLines("a\nb", 5)).toEqual(["a", "b"]);
  });
});
