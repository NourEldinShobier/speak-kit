import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PROVIDERS,
  BROWSERS,
  CREDIT_LINES,
  CopyCursor,
  EventLog,
  LINK_MESSAGES,
  MeetingSearch,
  MeetingStore,
  allProviders,
  isCredit,
  parseLink,
  readEntry,
  userProvider,
  windowMatches,
  type Line,
  type MeetingEntry,
} from "../src";
import { MemFs } from "./fakes";

const line = (start: number, who: "You" | "Them", text: string): Line => ({ start, end: start + 1, who, text });
const entry = (o: Partial<MeetingEntry> = {}): MeetingEntry => ({
  id: "m1",
  title: "T",
  titleTemporary: false,
  providerId: "zoom",
  providerName: "Zoom",
  startedAt: 5,
  durationSec: 0,
  status: "done",
  audio: { you: 0, them: 0 },
  notes: { state: "off", chapters: 0 },
  exports: [],
  ...o,
});

describe("the call app list", () => {
  it("is exactly Teams, Zoom, Meet, Slack huddles and Discord", () => {
    expect(BUILT_IN_PROVIDERS.map((p) => [p.id, p.name, p.mark, p.exes, !!p.inBrowser])).toEqual([
      ["teams", "Microsoft Teams", "Tm", ["ms-teams", "teams", "msteams", "microsoft teams"], true],
      ["zoom", "Zoom", "Zm", ["zoom", "zoom.us"], true],
      ["meet", "Google Meet", "Gm", [], true],
      ["slack", "Slack huddles", "Sl", ["slack"], true],
      ["discord", "Discord", "Dc", ["discord"], true],
    ]);
    const meet = BUILT_IN_PROVIDERS.find((p) => p.id === "meet")!;
    expect(meet.links).toEqual([{ host: "meet.google.com", path: "^/[a-z]{3}-[a-z]{4}-[a-z]{3}$" }]);
    expect(BUILT_IN_PROVIDERS.map((p) => p.titles?.length)).toEqual([2, 3, 2, 1, 2]);
  });

  it("matches each app by its window title", () => {
    const by = (id: string) => BUILT_IN_PROVIDERS.find((p) => p.id === id)!;
    const win = (exe: string, title: string) => ({ pid: 1, exe, title });
    expect(windowMatches(by("teams"), win("chrome", "Standup | Microsoft Teams"))).toBe(true);
    expect(windowMatches(by("teams"), win("chrome", "Microsoft Teams"))).toBe(true);
    expect(windowMatches(by("teams"), win("chrome", "Notes on Microsoft Teams"))).toBe(false);
    expect(windowMatches(by("zoom"), win("chrome", "Zoom Meeting"))).toBe(true);
    expect(windowMatches(by("zoom"), win("chrome", "Zoom Workplace"))).toBe(true);
    expect(windowMatches(by("zoom"), win("chrome", "Zoom"))).toBe(true);
    expect(windowMatches(by("zoom"), win("chrome", "Zoom pricing"))).toBe(false);
    expect(windowMatches(by("meet"), win("chrome", "abc-defg-hij - Google Chrome"))).toBe(true);
    expect(windowMatches(by("meet"), win("chrome", "Meet – abc-defg-hij"))).toBe(true);
    expect(windowMatches(by("slack"), win("chrome", "Huddle in #general"))).toBe(true);
    expect(windowMatches(by("slack"), win("chrome", "General - Slack"))).toBe(false);
    expect(windowMatches(by("discord"), win("chrome", "Voice Connected / Team"))).toBe(true);
    expect(windowMatches(by("discord"), win("chrome", "Team - voice channel - Discord"))).toBe(true);
    expect(windowMatches(by("discord"), win("chrome", "Discord"))).toBe(false);
    expect(windowMatches(by("zoom"), win("zoom", "anything"))).toBe(true);
  });

  it("counts every browser", () => {
    expect(BROWSERS).toEqual(["chrome", "msedge", "brave", "arc", "firefox", "opera", "vivaldi", "chromium", "safari", "google chrome", "microsoft edge", "brave browser", "opera gx"]);
  });

  it("refuses links by what is wrong with them and says it in words", () => {
    expect(LINK_MESSAGES).toEqual({
      empty: "Paste the full meeting link.",
      "not-a-link": "This is not a web link.",
      "too-short": "This link is too short to name one meeting. Paste the full link, with the meeting code.",
    });
    expect(parseLink("  ")).toEqual({ ok: false, problem: "empty" });
    expect(parseLink("http://")).toEqual({ ok: false, problem: "not-a-link" });
    expect(parseLink("javascript:alert(1)")).toEqual({ ok: false, problem: "not-a-link" });
    expect(parseLink("https://localhost/room-abcdef")).toEqual({ ok: false, problem: "not-a-link" });
    expect(parseLink("https://a.com/ab/c")).toEqual({ ok: false, problem: "too-short" });
    expect(parseLink("https://a.com/abcde")).toEqual({ ok: false, problem: "too-short" });
    expect(parseLink("https://a.com/abcdef")).toEqual({ ok: true, host: "a.com", path: "/abcdef" });
    expect(parseLink(" a.com/abcdef/g ")).toEqual({ ok: true, host: "a.com", path: "/abcdef/g" });
    expect(parseLink("http://a.com/room-1234///")).toEqual({ ok: true, host: "a.com", path: "/room-1234" });
    expect(parseLink("HTTPS://A.com/room-1234?x=1#y")).toEqual({ ok: true, host: "a.com", path: "/room-1234" });
  });

  it("builds a provider for an added app with exact fields and messages", () => {
    const named = userProvider({ name: "  my app! ", exe: " My App.EXE " }, []);
    expect(named).toEqual({ ok: true, provider: { id: "user-my-app", name: "my app!", mark: "My", exes: ["my app"], userAdded: true } });
    const symbols = userProvider({ name: "!!!", exe: "x" }, []);
    expect(symbols.ok && symbols.provider.id).toBe("user-app");
    const linked = userProvider({ name: "Room (a.b)", link: " https://r.example.com/a.b/c+d " }, []);
    expect(linked).toEqual({
      ok: true,
      provider: {
        id: "user-room-a-b",
        name: "Room (a.b)",
        mark: "Ro",
        exes: [],
        userAdded: true,
        inBrowser: true,
        links: [{ host: "r.example.com", path: "^/a\\.b/c\\+d$" }],
        titles: ["Room \\(a\\.b\\)"],
      },
    });
    const both = userProvider({ name: "Both", exe: "both", link: "https://both.example.com/room-1234" }, []);
    expect(both.ok && both.provider).toMatchObject({ exes: ["both"], inBrowser: true });
    expect(userProvider({ name: "" }, [])).toEqual({ ok: false, field: "name", message: "Give the app a name." });
    expect(userProvider({ name: "x" }, [])).toEqual({ ok: false, field: "app", message: "Choose the app or paste its meeting link." });
    expect(userProvider({ name: "x", link: "nope" }, [])).toEqual({ ok: false, field: "link", message: "This is not a web link." });
    const taken = [
      { id: "user-x", name: "x", mark: "X", exes: [] },
      { id: "user-x-2", name: "x", mark: "X", exes: [] },
    ];
    const third = userProvider({ name: "x", exe: "x" }, taken);
    expect(third.ok && third.provider.id).toBe("user-x-3");
  });

  it("puts added apps after the built-in ones and never lets one take a built-in id", () => {
    const mine = { id: "user-a", name: "A", mark: "A", exes: ["a"] };
    expect(allProviders([mine, { id: "teams", name: "Fake", mark: "F", exes: [] }]).map((p) => p.id)).toEqual(["teams", "zoom", "meet", "slack", "discord", "user-a"]);
  });
});

describe("credit lines", () => {
  it("knows exactly these per language", () => {
    expect(CREDIT_LINES).toEqual({
      en: [
        "thanks for watching",
        "thank you for watching",
        "thank you",
        "thanks",
        "please subscribe",
        "subtitles by the amara.org community",
        "subtitles by amara.org",
        "like and subscribe",
        "bye",
        "you",
      ],
      de: ["untertitel der amara.org-community", "untertitel im auftrag des zdf für funk, 2017", "vielen dank fürs zuschauen", "danke fürs zuschauen", "tschüss"],
      ar: ["اشتركوا في القناة", "شكرا للمشاهدة", "ترجمة نانسي قنقر"],
    });
    for (const [lang, list] of Object.entries(CREDIT_LINES)) for (const c of list) expect(isCredit(c, lang), c).toBe(true);
    expect(isCredit("Danke fürs Zuschauen!", "de")).toBe(true);
    expect(isCredit("Bye.", "auto")).toBe(true);
    expect(isCredit("bye", "xx")).toBe(true);
    expect(isCredit("bye")).toBe(true);
  });
});

describe("meeting search guards", () => {
  const make = (words: Record<string, string>) => {
    const s = new MeetingSearch();
    for (const [id, text] of Object.entries(words)) s.set(id, { title: id, text });
    return s;
  };

  it("lets a short word differ by nothing, a 4 to 7 letter word by one letter, a longer one by two", () => {
    const s = make({ a: "cat house kitchen elephants" });
    expect(s.search("cut")).toEqual([]);
    expect(s.search("hoose").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("hoosy")).toEqual([]);
    expect(s.search("kitcher").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("kitchun").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("elefants").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("elepents").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("elefzzzz")).toEqual([]);
    expect(s.search("wall")).toEqual([]);
  });

  it("corrects every misspelled word of a question and keeps the order of the words", () => {
    const s = make({ a: "release plan friday" });
    expect(s.search("relase plam").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("plam relase")).toEqual([{ id: "a", score: expect.any(Number), snippet: expect.any(String) }]);
  });

  it("picks the closest word among several that are near", () => {
    const s = make({ a: "plant plane planet", b: "other" });
    expect(s.search("plank").map((h) => h.id)).toEqual(["a"]);
    const s2 = make({ a: "friday", b: "fridge" });
    expect(s2.search("fridae").map((h) => h.id)).toEqual(["a"]);
  });

  it("forgets a word when the last meeting with it goes, and keeps it while another has it", () => {
    const s = make({ a: "apple banana", b: "apple" });
    s.remove("a");
    expect(s.search("aple").map((h) => h.id)).toEqual(["b"]);
    expect(s.search("bananna")).toEqual([]);
    s.remove("b");
    expect(s.search("aple")).toEqual([]);
    s.remove("nobody");
  });

  it("counts a word of two meetings once removed once, then still finds it (counts, not flags)", () => {
    const s = make({ a: "apple", b: "apple" });
    s.set("a", { title: "a", text: "apple apple apple" });
    s.remove("b");
    expect(s.search("aple").map((h) => h.id)).toEqual(["a"]);
  });

  it("moves its version with every change, not with a replaced document's own removal twice", () => {
    const s = new MeetingSearch();
    const v0 = s.version;
    s.set("a", { title: "a", text: "x" });
    expect(s.version).toBe(v0 + 1);
    s.set("a", { title: "a", text: "y" });
    expect(s.version).toBe(v0 + 2);
    s.remove("a");
    expect(s.version).toBe(v0 + 3);
    s.setVocabulary([]);
    expect(s.version).toBe(v0 + 4);
  });

  it("finds the other spelling of a vocabulary word either way round, and only when the whole phrase is there", () => {
    const s = new MeetingSearch();
    s.setVocabulary([
      { from: "okta setup", to: "Okta setup" },
      { from: "wazoo agent", to: "Wazuh agent" },
    ]);
    s.set("a", { title: "t", text: "the wazuh agent is here" });
    s.set("b", { title: "t", text: "the wazoo only" });
    expect(s.search("wazoo agent").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("wazuh").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("agent").map((h) => h.id)).toEqual(["a"]);
  });

  it("trims the question, ignores an empty one and answers the same question from memory", () => {
    const s = make({ a: "hello world" });
    expect(s.search("  hello  ").map((h) => h.id)).toEqual(["a"]);
    expect(s.search("   ")).toEqual([]);
    expect(s.search("hello")).toBe(s.search("hello"));
    expect(s.search("hello world").length).toBe(1);
    expect(s.search("nothing words")).toEqual([]);
    expect(make({}).search("x")).toEqual([]);
  });

  it("does not search twice for the same words after nothing changed, but does after a change", () => {
    const s = make({ a: "hello" });
    const first = s.search("hello");
    s.set("b", { title: "b", text: "hello again" });
    const second = s.search("hello");
    expect(second).not.toBe(first);
    expect(second.map((h) => h.id).sort()).toEqual(["a", "b"]);
  });

  it("joins the corrected words with a space", () => {
    const s = make({ a: "hello world" });
    expect(s.search("hellp worle").map((h) => h.id)).toEqual(["a"]);
  });
});

describe("copy new order", () => {
  it("returns lines by time, You before Them at the same time", () => {
    const c = new CopyCursor();
    const got = c.take([line(5, "Them", "c"), line(2, "You", "a"), line(5, "You", "b"), line(2, "Them", "z")]);
    expect(got.map((l) => `${l.start}${l.who[0]}`)).toEqual(["2Y", "2T", "5Y", "5T"]);
  });

  it("tells lines a millisecond apart from each other but not a rounding error", () => {
    const c = new CopyCursor();
    expect(c.take([line(1, "You", "x"), line(1.001, "You", "x")])).toHaveLength(2);
    expect(c.take([line(1.0001, "You", "x")])).toHaveLength(0);
    expect(c.pending([line(1, "You", "x"), line(9, "You", "y")])).toBe(1);
    expect(c.take([line(1, "You", "x"), line(9, "You", "y")]).map((l) => l.text)).toEqual(["y"]);
  });
});

describe("finished events, from a file", () => {
  const open = (fs: MemFs, now = () => 9000, cap?: number) => EventLog.open({ fs, file: "/e.json", now, ...(cap && { cap }) });
  const good = (seq: number) => ({ seq, type: "meeting.finished", at: 1, meetingId: `m${seq}`, title: "t", durationSec: 1 });

  it("reads its own file back: events, the number to continue from and who confirmed what", async () => {
    const fs = new MemFs();
    await fs.write("/e.json", JSON.stringify({ v: 1, last: 20, events: [good(3), good(7)], consumers: { cli: 3 } }));
    const log = await open(fs);
    expect(log.latest).toBe(20);
    expect(log.since(0).events.map((e) => e.seq)).toEqual([3, 7]);
    expect(log.status("cli").map((s) => s.delivered)).toEqual([true, false]);
    expect((await log.emit({ meetingId: "n", title: "t", durationSec: 1 })).seq).toBe(21);
  });

  it("takes the highest number there is when the saved last number is behind the events, or missing", async () => {
    const a = new MemFs();
    await a.write("/e.json", JSON.stringify({ last: 2, events: [good(5)] }));
    expect((await open(a)).latest).toBe(5);
    const b = new MemFs();
    await b.write("/e.json", JSON.stringify({ events: [good(4), good(6)] }));
    expect((await open(b)).latest).toBe(6);
    const c = new MemFs();
    await c.write("/e.json", JSON.stringify({ events: [] }));
    expect((await open(c)).latest).toBe(0);
  });

  it("drops events that are not events and ignores consumers that are not a map", async () => {
    const fs = new MemFs();
    await fs.write("/e.json", JSON.stringify({ last: 3, events: [good(1), null, { seq: "x", meetingId: "m" }, { seq: 2 }, good(3)], consumers: "no" }));
    const log = await open(fs);
    expect(log.since(0).events.map((e) => e.seq)).toEqual([1, 3]);
    expect(log.status("x").map((s) => s.delivered)).toEqual([false, false]);
    const nul = new MemFs();
    await nul.write("/e.json", "null");
    expect((await open(nul, () => 9000)).latest).toBe(0);
    const wrong = new MemFs();
    await wrong.write("/e.json", JSON.stringify({ last: 4, events: "nope" }));
    expect((await open(wrong)).since(0)).toEqual({ events: [], latest: 4, gap: true });
  });

  it("keeps exactly `cap` events and reports a gap only for a consumer behind the oldest kept", async () => {
    const log = await open(new MemFs(), () => 0, 3);
    for (let i = 0; i < 3; i++) await log.emit({ meetingId: `m${i}`, title: "t", durationSec: 1 });
    expect(log.since(0).events).toHaveLength(3);
    expect(log.since(0).gap).toBe(false);
    await log.emit({ meetingId: "m3", title: "t", durationSec: 1 });
    expect(log.since(0).events).toHaveLength(3);
    expect(log.since(0).gap).toBe(true);
    expect(log.since(1).gap).toBe(false);
  });

  it("limits what since returns and says a fresh log with a later number has a gap for an earlier one", async () => {
    const log = await open(new MemFs(), () => 0);
    for (let i = 0; i < 5; i++) await log.emit({ meetingId: `m${i}`, title: "t", durationSec: 1 });
    expect(log.since(0, 2).events).toHaveLength(2);
    expect(log.since(0).events).toHaveLength(5);
    const empty = await open(new MemFs(), () => 5000);
    expect(empty.since(0).gap).toBe(true);
    expect(empty.since(5).gap).toBe(false);
    expect(empty.since(5).events).toEqual([]);
  });

  it("writes on a confirmation only when it moves forward, and never past the newest event", async () => {
    const fs = new MemFs();
    const log = await open(fs, () => 0);
    await log.emit({ meetingId: "a", title: "t", durationSec: 1 });
    const n = fs.writeLog.length;
    await log.ack("c", log.latest);
    expect(fs.writeLog.length).toBe(n + 1);
    await log.ack("c", log.latest);
    await log.ack("c", 0);
    expect(fs.writeLog.length).toBe(n + 1);
    await log.ack("d", log.latest + 50);
    expect(log.status("d")[0]!.delivered).toBe(true);
    await log.ack("e", 0);
    expect(fs.writeLog.length).toBe(n + 2);
  });

  it("stamps each event with its type, time and the details it was given", async () => {
    const log = await open(new MemFs(), () => 777);
    const e = await log.emit({ meetingId: "m", title: "T", durationSec: 12 });
    expect(e).toEqual({ seq: e.seq, type: "meeting.finished", at: 777, meetingId: "m", title: "T", durationSec: 12 });
  });
});

describe("manifest rows", () => {
  it("keeps every status and notes state it knows and replaces the rest", () => {
    for (const status of ["recording", "saving", "transcribing", "done", "failed", "interrupted"]) expect(readEntry({ id: "a", status })!.status).toBe(status);
    expect(readEntry({ id: "a", status: "other" })!.status).toBe("failed");
    for (const state of ["off", "writing", "done", "failed"]) expect(readEntry({ id: "a", notes: { state } })!.notes.state).toBe(state);
    expect(readEntry({ id: "a", notes: { state: "x" } })!.notes.state).toBe("off");
    expect(readEntry({ id: "a", notes: { state: "writing", chapters: 3 } })!.notes).toEqual({ state: "writing", chapters: 3 });
    expect(readEntry({ id: "a" })).toMatchObject({ title: "Meeting", providerId: "unknown", providerName: "Call", titleTemporary: false, startedAt: 0, durationSec: 0 });
  });

  it("reads a failure only when it has a message, and numbers only when finite", () => {
    expect(readEntry({ id: "a", failure: { code: "x", message: "m" } })!.failure).toEqual({ code: "x", message: "m" });
    expect(readEntry({ id: "a", failure: { message: "m" } })!.failure).toEqual({ code: "failed", message: "m" });
    expect(readEntry({ id: "a", failure: { code: "x" } })!.failure).toBeUndefined();
    expect(readEntry({ id: "a", failure: "text" })!.failure).toBeUndefined();
    expect(readEntry({ id: "a", failure: null })!.failure).toBeUndefined();
    expect(readEntry({ id: "a", notes: { state: "failed", failure: { code: "q", message: "w" } } })!.notes.failure).toEqual({ code: "q", message: "w" });
    const e = readEntry({ id: "a", endedAt: 5, audioRemovedAt: 6, trashedAt: 7, startedAt: Infinity, durationSec: NaN })!;
    expect(e).toMatchObject({ endedAt: 5, audioRemovedAt: 6, trashedAt: 7, startedAt: 0, durationSec: 0 });
    const bad = readEntry({ id: "a", endedAt: "5", audioRemovedAt: null, trashedAt: NaN })!;
    expect("endedAt" in bad || "audioRemovedAt" in bad || "trashedAt" in bad).toBe(false);
    expect(readEntry({ id: "a", audio: { you: 3, them: "x" } })!.audio).toEqual({ you: 3, them: 0 });
    expect(readEntry({ id: 5 })).toBeUndefined();
    expect(readEntry("x")).toBeUndefined();
    expect(readEntry({ id: "a", titleTemporary: "yes" })!.titleTemporary).toBe(false);
    expect(readEntry({ id: "a", titleTemporary: true })!.titleTemporary).toBe(true);
  });
});

describe("the store on disk", () => {
  const open = (fs: MemFs) => MeetingStore.open({ dir: "/d", fs, now: () => 99 });

  it("reads the version of the manifest: 1 is current, 2 is newer, a missing one is current", async () => {
    for (const [v, newer] of [
      [1, false],
      [2, true],
      [undefined, false],
    ] as const) {
      const fs = new MemFs();
      await fs.write("/d/manifest.json", JSON.stringify({ v, entries: [] }));
      expect((await open(fs)).notice).toEqual({ newer });
    }
  });

  it("works from nothing and never writes when the manifest cannot be read", async () => {
    const fs = new MemFs();
    fs.read = async () => {
      throw new Error("locked");
    };
    const s = await open(fs);
    expect(s.notice).toEqual({ newer: true });
    expect(s.list()).toEqual([]);
    await expect(s.mutate((m) => void m.set("a", entry()))).rejects.toThrow("newer version");
  });

  it("reports the manifest as newer when it cannot be set aside either", async () => {
    const fs = new MemFs();
    await fs.write("/d/manifest.json", "{bad");
    fs.failOn = /invalid/;
    expect((await open(fs)).notice).toEqual({ newer: true });
  });

  it("skips rows without an id and a manifest whose entries are not a list", async () => {
    const fs = new MemFs();
    await fs.write("/d/manifest.json", JSON.stringify({ v: 1, entries: [{ id: "a" }, { title: "x" }, null] }));
    expect((await open(fs)).list().map((e) => e.id)).toEqual(["a"]);
    const g = new MemFs();
    await g.write("/d/manifest.json", JSON.stringify({ v: 1, entries: "x" }));
    expect((await open(g)).list()).toEqual([]);
  });

  it("lists newest first and the later id first at the same time", async () => {
    const s = await open(new MemFs());
    await s.mutate((m) => {
      m.set("a", entry({ id: "a", startedAt: 5 }));
      m.set("b", entry({ id: "b", startedAt: 5 }));
      m.set("c", entry({ id: "c", startedAt: 9 }));
      m.set("d", entry({ id: "d", startedAt: 1 }));
    });
    expect(s.list().map((e) => e.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("changes memory for a change the disk refused, for a meeting that exists only", async () => {
    const s = await open(new MemFs());
    await s.mutate((m) => void m.set("a", entry({ id: "a" })));
    s.patchMemory("a", { title: "New" });
    s.patchMemory("none", { title: "X" });
    expect(s.get("a")!.title).toBe("New");
    expect(s.get("none")).toBeUndefined();
    expect(s.get("a")).toMatchObject({ providerId: "zoom" });
  });

  it("reads and writes the transcript and the notes, and says nothing for missing or damaged files", async () => {
    const fs = new MemFs();
    const s = await open(fs);
    expect(await s.transcript("a")).toEqual([]);
    expect(await s.notes("a")).toEqual([]);
    await fs.write("/d/a/transcript.json", JSON.stringify({ lines: [{ start: 1, end: 2, text: "x", who: "You" }, { text: "y", who: "Other" }, { start: 3 }, null] }));
    expect(await s.transcript("a")).toEqual([
      { start: 1, end: 2, text: "x", who: "You" },
      { start: 0, end: 0, text: "y", who: "Them" },
    ]);
    await fs.write("/d/a/transcript.json", JSON.stringify({ lines: "x" }));
    expect(await s.transcript("a")).toEqual([]);
    await fs.write("/d/a/notes.json", JSON.stringify({ versions: [{ n: 1, summary: "s" }, { n: 2 }, null, "x"] }));
    expect((await s.notes("a")).map((v) => v.n)).toEqual([1]);
    await fs.write("/d/a/notes.json", "garbage");
    expect(await s.notes("a")).toEqual([]);
    await fs.write("/d/a/notes.json", JSON.stringify({ versions: 3 }));
    expect(await s.notes("a")).toEqual([]);
    fs.read = async () => {
      throw new Error("io");
    };
    expect(await s.transcript("a")).toEqual([]);
    expect(await s.notes("a")).toEqual([]);
  });

  it("numbers note versions from the last one and writes version 1 files", async () => {
    const fs = new MemFs();
    const s = await open(fs);
    const base = { at: 1, kind: "summary" as const, title: "T", summary: "S", chapters: [], writer: "w" };
    await s.addNotes("a", base);
    await s.putTranscript("a", [line(0, "You", "hi")]);
    expect(JSON.parse(fs.text("/d/a/notes.json")!)).toMatchObject({ v: 1, versions: [{ n: 1 }] });
    expect(JSON.parse(fs.text("/d/a/transcript.json")!)).toMatchObject({ v: 1 });
    await fs.write("/d/a/notes.json", JSON.stringify({ v: 1, versions: [{ n: 7, summary: "x" }] }));
    expect((await s.addNotes("a", base)).n).toBe(8);
  });

  it("removes every file of a meeting, or only those it is told", async () => {
    const fs = new MemFs();
    const s = await open(fs);
    for (const f of ["you.wav", "them.wav", "you.pcm", "them.pcm", "transcript.json", "notes.json", "other.txt"]) await fs.write(`/d/a/${f}`, "x");
    await s.removeFiles("a", ["you.wav"]);
    expect([...fs.files.keys()].some((k) => k.endsWith("you.wav"))).toBe(false);
    expect(fs.files.size).toBe(6);
    await s.removeFiles("a");
    expect([...fs.files.keys()]).toEqual(["/d/a/other.txt"]);
    expect(s.files("a").spool("you")).toBe("/d/a/you.pcm");
    expect(s.files("a").wav("them")).toBe("/d/a/them.wav");
    expect(s.manifest).toBe("/d/manifest.json");
    expect(s.folder("z")).toBe("/d/z");
  });
});
