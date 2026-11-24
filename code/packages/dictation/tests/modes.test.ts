import { describe, expect, it } from "vite-plus/test";
import {
  addMode,
  applyMode,
  clampDeadline,
  defaultMode,
  defaultSettings,
  keepsFacts,
  normalizeSite,
  reportsPages,
  setSites,
  siteMatches,
  mergeReplacements,
  removeMode,
  resolveMode,
  rewritePass,
  TEMPLATE_IDS,
  TEMPLATES,
  setApps,
  type WritingMode as Mode,
  type Rewriter,
} from "../src";
import { fakeClock, flush, rig, target } from "./fakes";

const mode = (extra: Partial<Mode>): Mode => ({ ...defaultMode(), id: "x", name: "X", ...extra });

describe("modes", () => {
  it("adds a mode, refusing blank, long and repeated names", () => {
    const r = addMode([defaultMode()], " Code editor ");
    expect(r.ok && r.mode).toMatchObject({ name: "Code editor", apps: [], rewrite: false });
    expect(addMode([defaultMode()], " ")).toEqual({ ok: false, error: "empty" });
    expect(addMode([defaultMode()], "x".repeat(41))).toEqual({ ok: false, error: "too-long" });
    expect(addMode([defaultMode()], "default")).toEqual({ ok: false, error: "duplicate" });
    expect(addMode([], " DEFAULT ")).toEqual({ ok: false, error: "duplicate" });
    expect(
      addMode(
        Array.from({ length: 24 }, (_, i) => mode({ id: `m${i}`, name: `n${i}` })),
        "one more",
      ),
    ).toEqual({ ok: false, error: "full" });
  });

  it("removes a mode by id", () => {
    expect(removeMode([mode({}), mode({ id: "y" })], "x").map((m) => m.id)).toEqual(["y"]);
  });

  it("gives an app to one mode: adding it elsewhere takes it away", () => {
    const list = [mode({ id: "a", apps: ["code"] }), mode({ id: "b", apps: [] })];
    const next = setApps(list, "b", ["Code.exe", "cursor", "cursor"]);
    expect(next.find((m) => m.id === "a")?.apps).toEqual([]);
    expect(next.find((m) => m.id === "b")?.apps).toEqual(["code", "cursor"]);
  });

  it("picks the mode that lists the program, in any case and with .exe, else the default", () => {
    const list = [mode({ id: "t", apps: ["windowsterminal"] })];
    expect(resolveMode(list, "WindowsTerminal.exe").id).toBe("t");
    expect(resolveMode(list, "notepad.exe").id).toBe("default");
    expect(resolveMode(list, undefined).id).toBe("default");
    expect(resolveMode([], "x.exe").id).toBe("default");
  });

  it("adds its own words and the rewrite choice for its apps and changes nothing for the default mode", () => {
    const base = { ...defaultSettings };
    expect(applyMode(base, defaultMode())).toEqual({ ...base, rewrite: false, template: "tidy" });
    const out = applyMode(base, mode({ rewrite: true, terms: [{ id: "1", word: "pnpm", soundsLike: [] }] }));
    expect(out).toMatchObject({ autoCapitalize: true, stripFinalStop: false, insertMode: "paste", rewrite: true });
    expect(out.terms.map((t) => t.word)).toEqual(["pnpm"]);
    expect(out.template).toBe("tidy");
    expect(applyMode(base, mode({ template: "notes" })).template).toBe("notes");
  });
});

describe("modes by website", () => {
  it("reduces what was typed to a host name and refuses what is not one", () => {
    expect(normalizeSite("https://www.Mail.Google.com/inbox?x=1#y")).toBe("mail.google.com");
    expect(normalizeSite("  Docs.Example.org:8080/a ")).toBe("docs.example.org");
    expect(normalizeSite("user:pw@example.com")).toBe("example.com");
    expect(normalizeSite("localhost:3000")).toBe("localhost");
    expect(normalizeSite("example.com.")).toBe("example.com");
    for (const bad of ["", "   ", "two words.com", "nodot", "a..b", "-a.com", "a.c", "http://", "exa mple.com"]) expect(normalizeSite(bad), bad).toBe("");
  });

  it("covers the host and the hosts under it, not a host that only ends the same way", () => {
    expect(siteMatches("google.com", "google.com")).toBe(true);
    expect(siteMatches("google.com", "mail.google.com")).toBe(true);
    expect(siteMatches("mail.google.com", "google.com")).toBe(false);
    expect(siteMatches("google.com", "notgoogle.com")).toBe(false);
  });

  it("knows which programs are browsers that report the page, on Windows and macOS", () => {
    for (const exe of ["chrome.exe", "MSEDGE.EXE", "com.google.Chrome", "com.microsoft.edgemac", "brave.exe"]) expect(reportsPages(exe), exe).toBe(true);
    for (const exe of ["firefox.exe", "notepad.exe", "com.apple.Safari", "", undefined]) expect(reportsPages(exe), String(exe)).toBe(false);
  });

  it("gives a site to one mode: adding it elsewhere takes it away", () => {
    const list = [mode({ id: "a", sites: ["mail.google.com", "slack.com"] }), mode({ id: "b" })];
    const next = setSites(list, "b", ["https://www.Slack.com/x", "slack.com", "bad name", "github.com"]);
    expect(next.find((m) => m.id === "a")?.sites).toEqual(["mail.google.com"]);
    expect(next.find((m) => m.id === "b")?.sites).toEqual(["slack.com", "github.com"]);
  });

  const list = [
    mode({ id: "work", sites: ["google.com"] }),
    mode({ id: "mail", sites: ["mail.google.com"] }),
    mode({ id: "chrome", apps: ["chrome"] }),
    mode({ id: "term", apps: ["windowsterminal"], sites: ["example.com"] }),
  ];
  it("picks the mode of the page in a browser, the most specific site first", () => {
    expect(resolveMode(list, "chrome.exe", "mail.google.com").id).toBe("mail");
    expect(resolveMode(list, "chrome.exe", "drive.google.com").id).toBe("work");
    expect(resolveMode(list, "chrome.exe", "Mail.Google.com").id).toBe("mail");
  });
  it("falls back to the browser's own mode, then the default, when no site matches or none was reported", () => {
    expect(resolveMode(list, "chrome.exe", "other.org").id).toBe("chrome");
    expect(resolveMode(list, "chrome.exe", undefined).id).toBe("chrome");
    expect(resolveMode(list, "chrome.exe", "").id).toBe("chrome");
    expect(resolveMode(list, "msedge.exe", "other.org").id).toBe("default");
  });
  it("ignores the page when the program in front is not a browser that reports it", () => {
    expect(resolveMode(list, "windowsterminal.exe", "mail.google.com").id).toBe("term");
    expect(resolveMode(list, "notepad.exe", "mail.google.com").id).toBe("default");
    expect(resolveMode(list, undefined, "mail.google.com").id).toBe("default");
  });
  it("dictates with the replacements of the page's mode", async () => {
    const mail = mode({ id: "mail", name: "Mail", sites: ["mail.google.com"], replacements: [{ from: "there", to: "team" }] });
    const r = await rig({ modes: [mail] });
    r.ins.state.current = target({ exe: "chrome.exe", site: "mail.google.com" });
    r.stt.state.result = { ok: true, text: "Hello There." };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.text).toBe("Hello team. ");
    r.ins.state.current = target({ exe: "chrome.exe", site: "news.org" });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[1]?.text).toBe("Hello There. ");
  });
});

describe("rewrite pass", () => {
  const run = async (rewriter: Rewriter, text = "hello there ", deadlineMs = 4000) => {
    const time = fakeClock();
    const p = rewritePass({ text, rewriter, deadlineMs, clock: time.clock });
    return { p, time };
  };

  it("returns the rewritten text and keeps the trailing space", async () => {
    const { p } = await run({ rewrite: async ({ text }) => `${text.toUpperCase()}!` });
    expect(await p).toEqual({ text: "HELLO THERE! ", outcome: "rewritten" });
  });

  it("gives back the text as said when the writer is silent past the deadline, and aborts it", async () => {
    let signal: AbortSignal | undefined;
    const { p, time } = await run({ rewrite: ({ signal: s }) => ((signal = s), new Promise(() => {})) });
    await time.advance(3999);
    expect(signal?.aborted).toBe(false);
    await time.advance(1);
    expect(await p).toEqual({ text: "hello there ", outcome: "deadline" });
    expect(signal?.aborted).toBe(true);
    expect(time.pending()).toBe(0);
  });

  it("cuts the deadline short even when finding the writer takes all the time", async () => {
    const { p, time } = await run({ rewrite: () => new Promise((r) => setTimeout(r, 60_000)) }, "x", 1000);
    await time.advance(1000);
    expect((await p).outcome).toBe("deadline");
  });

  it("falls back on an error, an empty answer and a writer that throws at once", async () => {
    expect((await (await run({ rewrite: async () => Promise.reject(new Error("401")) })).p).outcome).toBe("failed");
    expect((await (await run({ rewrite: async () => "  " })).p).outcome).toBe("failed");
    expect(
      (
        await (
          await run({
            rewrite: () => {
              throw new Error("sync");
            },
          })
        ).p
      ).outcome,
    ).toBe("failed");
  });

  it("never sends numbers-only text", async () => {
    let called = false;
    const { p } = await run({ rewrite: async () => ((called = true), "x") }, "1 2 3.5 ");
    expect(await p).toEqual({ text: "1 2 3.5 ", outcome: "numbers-only" });
    expect(called).toBe(false);
  });

  it("rejects an answer that changes figures or a dictated list", async () => {
    expect((await (await run({ rewrite: async () => "call 15 people" }, "call 50 people")).p).outcome).toBe("changed-facts");
    expect(keepsFacts("- a\n- b", "a and b")).toBe(false);
    expect(keepsFacts("1. a\n2. b", "1. A\n2. B")).toBe(true);
    expect(keepsFacts("pay 5 now", "Pay 5 now")).toBe(true);
  });

  it("keeps the missing final full stop the setting chose, whatever the writer returns", async () => {
    const loud: Rewriter = { rewrite: async () => "Hello There." };
    const stop = await rewritePass({ text: "Hello there ", rewriter: loud, deadlineMs: 4000, clock: fakeClock().clock, style: { capitals: "sentence", stripFinalStop: true } });
    expect(stop.text).toBe("Hello There ");
  });

  it("drops a rewrite that moved capitals when they are kept as spoken, and tells the writer the style", async () => {
    let seen: unknown;
    const rw: Rewriter = { rewrite: async ({ style }) => ((seen = style), "Hello there") };
    const style = { capitals: "keep", stripFinalStop: false } as const;
    expect(await rewritePass({ text: "hello there ", rewriter: rw, deadlineMs: 4000, clock: fakeClock().clock, style })).toEqual({ text: "hello there ", outcome: "changed-style" });
    expect(seen).toEqual(style);
    const same: Rewriter = { rewrite: async () => "hello there, friend" };
    expect((await rewritePass({ text: "hello there ", rewriter: same, deadlineMs: 4000, clock: fakeClock().clock, style })).outcome).toBe("rewritten");
  });

  it("clamps the deadline to 1 to 15 seconds and falls back to 4 for nonsense", () => {
    expect([clampDeadline(10), clampDeadline(4000), clampDeadline(99_999), clampDeadline(NaN), clampDeadline(Infinity)]).toEqual([1000, 4000, 15_000, 4000, 4000]);
  });

  it("handles two calls at once without crossing their deadlines", async () => {
    const time = fakeClock();
    const slow: Rewriter = { rewrite: () => new Promise(() => {}) };
    const fast: Rewriter = { rewrite: async () => "fast" };
    const a = rewritePass({ text: "a", rewriter: slow, deadlineMs: 1000, clock: time.clock });
    const b = rewritePass({ text: "b", rewriter: fast, deadlineMs: 1000, clock: time.clock });
    expect((await b).outcome).toBe("rewritten");
    await time.advance(1000);
    expect((await a).outcome).toBe("deadline");
  });
});

describe("dictation with modes, words and rewrite", () => {
  const code = mode({ id: "code", name: "Code", apps: ["code"], terms: [{ id: "k", word: "kubectl", soundsLike: ["cube cuddle"] }] });
  const settings = { modes: [code], terms: [{ id: "s", word: "Wazuh", soundsLike: ["wasu"] }] };

  it("uses the shared words everywhere and the mode's own words and rules in its apps", async () => {
    const r = await rig(settings);
    r.ins.state.current = target({ exe: "notepad.exe" });
    r.stt.state.result = { ok: true, text: "run cube cuddle on wasu." };
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.text).toBe("Run cube cuddle on Wazuh. ");

    r.ins.state.current = target({ exe: "Code.exe" });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[1]?.text).toBe("Run kubectl on Wazuh. ");
  });

  it("sends the words to the speech model as a prompt in the order of the list, merged with the mode's", async () => {
    const r = await rig(settings);
    r.ins.state.current = target({ exe: "code.exe" });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.stt.calls[0]?.prompt).toBe("Wazuh, kubectl");
  });

  it("sends no prompt when the switch is off or there are no words", async () => {
    const off = await rig({ ...settings, prompt: false });
    await off.hold(1000);
    await off.time.advance(200);
    expect(off.stt.calls[0]).not.toHaveProperty("prompt");
    const none = await rig();
    await none.hold(1000);
    await none.time.advance(200);
    expect(none.stt.calls[0]).not.toHaveProperty("prompt");
  });

  it("rewrites only in a mode that asks for it, with the switch on, and records the outcome", async () => {
    const rewriter: Rewriter = { rewrite: async ({ text }) => `Polished: ${text}` };
    const chat = mode({ id: "chat", apps: ["slack"], rewrite: true });
    const r = await rig({ modes: [chat], rewrite: { enabled: true, deadlineMs: 4000 } }, undefined, { rewriter });
    r.ins.state.current = target({ exe: "slack.exe" });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.text).toBe("Polished: Hello world ");
    expect((await r.dictation.history.list())[0]?.rewrite).toBe("rewritten");

    r.ins.state.current = target({ exe: "notepad.exe" });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[1]?.text).toBe("Hello world ");
    expect((await r.dictation.history.list())[0]?.rewrite).toBeUndefined();
  });

  it("pastes as said after the deadline and says so in the history", async () => {
    const chat = mode({ id: "chat", apps: ["notepad"], rewrite: true });
    const r = await rig({ modes: [chat], rewrite: { enabled: true, deadlineMs: 4000 } }, undefined, { rewriter: { rewrite: () => new Promise(() => {}) } });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted).toHaveLength(0);
    await r.time.advance(4000);
    await flush();
    expect(r.ins.inserted[0]?.text).toBe("Hello world ");
    expect((await r.dictation.history.list())[0]?.rewrite).toBe("deadline");
  });

  it("does not rewrite when the opt-in switch is off, even in a mode that asks", async () => {
    let called = 0;
    const chat = mode({ id: "chat", apps: ["notepad"], rewrite: true });
    const r = await rig({ modes: [chat], rewrite: { enabled: false, deadlineMs: 4000 } }, undefined, { rewriter: { rewrite: async () => (called++, "x") } });
    await r.hold(1000);
    await r.time.advance(200);
    expect(called).toBe(0);
  });
});

describe("replacements per mode", () => {
  const shared = [
    { from: "gonna", to: "going to" },
    { from: "Foo", to: "shared foo" },
  ];

  it("adds the mode's replacements after the shared ones, and the mode wins for the same phrase whatever the capitals", () => {
    expect(
      mergeReplacements(shared, [
        { from: "foo", to: "mode foo", matchCase: true },
        { from: "bar", to: "baz" },
      ]),
    ).toEqual([
      { from: "gonna", to: "going to" },
      { from: "foo", to: "mode foo", matchCase: true },
      { from: "bar", to: "baz" },
    ]);
    expect(mergeReplacements(shared, [])).toEqual(shared);
    expect(mergeReplacements([], shared)).toEqual(shared);
  });

  it("applies in a mode but never changes the default mode", () => {
    const base = { ...defaultSettings, replacements: shared };
    const own = [{ from: "ship it", to: "deploy" }];
    expect(applyMode(base, mode({ replacements: own })).replacements).toEqual([...shared, ...own]);
    expect(applyMode(base, { ...defaultMode(), replacements: own }).replacements).toEqual(shared);
  });

  it("swaps the phrase in the mode's app and not in another", async () => {
    const chat = mode({ id: "chat", name: "Chat", apps: ["slack"], replacements: [{ from: "world", to: "team" }] });
    const r = await rig({ modes: [chat] });
    r.ins.state.current = target({ exe: "slack.exe" });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.text).toBe("Hello team ");
    r.ins.state.current = target({ exe: "notepad.exe" });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[1]?.text).toBe("Hello world ");
  });
});

describe("rewrite templates", () => {
  it("lists the eight templates, and only notes and concise may change list lines", () => {
    expect([...TEMPLATE_IDS]).toEqual(["tidy", "exact", "message", "email", "formal", "notes", "concise", "technical"]);
    expect(TEMPLATE_IDS.filter((id) => !TEMPLATES[id].keepsLists)).toEqual(["notes", "concise"]);
    expect(TEMPLATES.tidy.name).toBe("Tidy");
  });

  it("accepts a different number of list lines for notes and concise, and rejects it for the others", () => {
    expect(keepsFacts("pack the tent the stove and the bags", "- tent\n- stove\n- bags", "notes")).toBe(true);
    expect(keepsFacts("- tent\n- stove\n- bags", "Tent, stove and bags", "concise")).toBe(true);
    for (const id of ["tidy", "exact", "message", "email", "formal", "technical"] as const) {
      expect(keepsFacts("- tent\n- stove", "Tent and stove", id), id).toBe(false);
      expect(keepsFacts("- tent\n- stove", "- Tent\n- Stove", id), id).toBe(true);
    }
    expect(keepsFacts("- tent\n- stove", "Tent and stove")).toBe(false);
  });

  it("rejects changed figures for every template", () => {
    for (const id of TEMPLATE_IDS) {
      expect(keepsFacts("call 50 people", "Call 15 people.", id), id).toBe(false);
      expect(keepsFacts("bring 3 contracts", "Bring three contracts.", id), id).toBe(false);
      expect(keepsFacts("bring 3 contracts", "Bring 3 contracts.", id), id).toBe(true);
    }
  });

  it("lets the pass turn prose into notes with the notes template and drops the same answer with Tidy", async () => {
    const rw: Rewriter = { rewrite: async () => "- tent\n- stove\n- bags" };
    const text = "the tent the stove and the bags ";
    const ask = (template: "notes" | "tidy") => rewritePass({ text, rewriter: rw, deadlineMs: 4000, clock: fakeClock().clock, style: { capitals: "sentence", stripFinalStop: false, template } });
    expect((await ask("notes")).outcome).toBe("rewritten");
    expect(await ask("tidy")).toEqual({ text, outcome: "changed-facts" });
  });

  it("gives the writer the template of the mode in use, and no call where the mode has no rewrite", async () => {
    const styles: unknown[] = [];
    const rewriter: Rewriter = { rewrite: async ({ text, style }) => (styles.push(style), text) };
    const chat = mode({ id: "chat", name: "Chat", apps: ["slack"], rewrite: true, template: "message" });
    const r = await rig({ modes: [chat], rewrite: { enabled: true, deadlineMs: 4000 } }, undefined, { rewriter });
    const say = async (exe: string) => {
      r.ins.state.current = target({ exe });
      await r.hold(1000);
      await r.time.advance(200);
    };
    await say("slack.exe");
    await say("notepad.exe");
    expect(styles).toEqual([{ capitals: "sentence", stripFinalStop: false, template: "message" }]);
  });
});
