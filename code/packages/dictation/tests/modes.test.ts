import { describe, expect, it } from "vite-plus/test";
import {
  addMode,
  applyMode,
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
  WriterLoadingError,
} from "../src";
import { flush, rig, target } from "./fakes";

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
  const run = (rewriter: Rewriter, text = "hello there ", skip = new AbortController()) => ({ p: rewritePass({ text, rewriter, skip: skip.signal }), skip });

  it("returns the rewritten text and keeps the trailing space", async () => {
    const { p } = run({ rewrite: async ({ text }) => `${text.toUpperCase()}!` });
    expect(await p).toEqual({ text: "HELLO THERE! ", outcome: "rewritten" });
  });

  it("waits for a slow writer as long as it works, then uses its answer", async () => {
    const { p } = run({ rewrite: ({ text }) => new Promise((r) => setTimeout(() => r(text.toUpperCase()), 30)) });
    expect(await p).toEqual({ text: "HELLO THERE ", outcome: "rewritten" });
  });

  it("gives back the text as said when the person skips, and aborts the writer", async () => {
    let signal: AbortSignal | undefined;
    const { p, skip } = run({ rewrite: ({ signal: s }) => ((signal = s), new Promise(() => {})) });
    await Promise.resolve();
    expect(signal?.aborted).toBe(false);
    skip.abort();
    expect(await p).toEqual({ text: "hello there ", outcome: "skipped" });
    expect(signal?.aborted).toBe(true);
  });

  it("does not call the writer when the rewrite was skipped before it started", async () => {
    let called = false;
    const skip = new AbortController();
    skip.abort();
    expect(await run({ rewrite: async () => ((called = true), "x") }, "hello ", skip).p).toEqual({ text: "hello ", outcome: "skipped" });
    expect(called).toBe(false);
  });

  it("pastes the text as said at once when the writer is still loading, and tags it", async () => {
    const { p } = run({ rewrite: () => Promise.reject(new WriterLoadingError()) });
    expect(await p).toEqual({ text: "hello there ", outcome: "writer-loading" });
    const sync = run({
      rewrite: () => {
        throw new WriterLoadingError();
      },
    });
    expect(await sync.p).toEqual({ text: "hello there ", outcome: "writer-loading" });
  });

  it("still waits for a writer that is ready, and a writer that answers with the word failed is an answer", async () => {
    const { p } = run({ rewrite: ({ text }) => new Promise((r) => setTimeout(() => r(`${text.trim()} failed`), 20)) });
    expect(await p).toEqual({ text: "hello there failed ", outcome: "rewritten" });
  });

  it("falls back on an error, an empty answer and a writer that throws at once", async () => {
    expect((await run({ rewrite: async () => Promise.reject(new Error("401")) }).p).outcome).toBe("failed");
    expect((await run({ rewrite: async () => "  " }).p).outcome).toBe("failed");
    const sync = run({
      rewrite: () => {
        throw new Error("sync");
      },
    });
    expect((await sync.p).outcome).toBe("failed");
  });

  it("never sends numbers-only text", async () => {
    let called = false;
    const { p } = run({ rewrite: async () => ((called = true), "x") }, "1 2 3.5 ");
    expect(await p).toEqual({ text: "1 2 3.5 ", outcome: "numbers-only" });
    expect(called).toBe(false);
  });

  it("rejects an answer that changes figures or a dictated list", async () => {
    expect((await run({ rewrite: async () => "call 15 people" }, "call 50 people").p).outcome).toBe("changed-facts");
    expect(keepsFacts("- a\n- b", "a and b")).toBe(false);
    expect(keepsFacts("1. a\n2. b", "1. A\n2. B")).toBe(true);
    expect(keepsFacts("pay 5 now", "Pay 5 now")).toBe(true);
  });

  it("keeps the missing final full stop the setting chose, whatever the writer returns", async () => {
    const loud: Rewriter = { rewrite: async () => "Hello There." };
    const stop = await rewritePass({ text: "Hello there ", rewriter: loud, skip: new AbortController().signal, style: { capitals: "sentence", stripFinalStop: true } });
    expect(stop.text).toBe("Hello There ");
  });

  it("drops a rewrite that moved capitals when they are kept as spoken, and tells the writer the style", async () => {
    let seen: unknown;
    const rw: Rewriter = { rewrite: async ({ style }) => ((seen = style), "Hello there") };
    const style = { capitals: "keep", stripFinalStop: false } as const;
    expect(await rewritePass({ text: "hello there ", rewriter: rw, skip: new AbortController().signal, style })).toEqual({ text: "hello there ", outcome: "changed-style" });
    expect(seen).toEqual(style);
    const same: Rewriter = { rewrite: async () => "hello there, friend" };
    expect((await rewritePass({ text: "hello there ", rewriter: same, skip: new AbortController().signal, style })).outcome).toBe("rewritten");
  });

  it("handles two calls at once: skipping one leaves the other alone", async () => {
    const slow: Rewriter = { rewrite: () => new Promise(() => {}) };
    const fast: Rewriter = { rewrite: async () => "fast" };
    const skipA = new AbortController();
    const a = rewritePass({ text: "a", rewriter: slow, skip: skipA.signal });
    const b = rewritePass({ text: "b", rewriter: fast, skip: new AbortController().signal });
    expect((await b).outcome).toBe("rewritten");
    skipA.abort();
    expect((await a).outcome).toBe("skipped");
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
    const r = await rig({ modes: [chat], rewrite: { enabled: true } }, undefined, { rewriter });
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

  it("waits for a slow writer without any time limit, and shows the person can skip", async () => {
    let answer: (t: string) => void = () => {};
    const chat = mode({ id: "chat", apps: ["notepad"], rewrite: true });
    const r = await rig({ modes: [chat], rewrite: { enabled: true } }, undefined, { rewriter: { rewrite: () => new Promise<string>((res) => (answer = res)) } });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.dictation.state()).toEqual({ status: "transcribing", rewriting: true });
    await r.time.advance(10 * 60_000);
    expect(r.ins.inserted).toHaveLength(0);
    answer("Polished");
    await flush();
    expect(r.ins.inserted[0]?.text).toBe("Polished ");
    expect(r.dictation.state()).toEqual({ status: "idle", notice: { kind: "inserted" } });
  });

  it("the cancel key while the writer works skips the rewrite: the text is pasted as said and the history says so", async () => {
    let signal: AbortSignal | undefined;
    const chat = mode({ id: "chat", apps: ["notepad"], rewrite: true });
    const r = await rig({ modes: [chat], rewrite: { enabled: true } }, undefined, { rewriter: { rewrite: (req) => ((signal = req.signal), new Promise(() => {})) } });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.keys.send("Escape", true, r.time.clock.now())).toBe(true);
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(r.ins.inserted[0]?.text).toBe("Hello world ");
    expect((await r.dictation.history.list())[0]?.rewrite).toBe("skipped");
    expect(r.dictation.state().status).toBe("idle");
  });

  it("cancel() (the Skip button) skips the same way, and the next dictation rewrites normally", async () => {
    let calls = 0;
    const chat = mode({ id: "chat", apps: ["notepad"], rewrite: true });
    const rewriter: Rewriter = { rewrite: () => (++calls === 1 ? new Promise(() => {}) : Promise.resolve("Second")) };
    const r = await rig({ modes: [chat], rewrite: { enabled: true } }, undefined, { rewriter });
    await r.hold(1000);
    await r.time.advance(200);
    r.dictation.cancel();
    await flush();
    expect(r.ins.inserted[0]?.text).toBe("Hello world ");
    await r.time.advance(2000);
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[1]?.text).toBe("Second ");
  });

  it("the cancel key does nothing to the text while no rewrite runs", async () => {
    const r = await rig();
    r.stt.state.result = { ok: true, text: "hello" };
    await r.hold(1000);
    expect(r.keys.send("Escape", true, r.time.clock.now())).toBe(false);
  });

  it("a writer that fails still falls back at once to the text as said", async () => {
    const chat = mode({ id: "chat", apps: ["notepad"], rewrite: true });
    const r = await rig({ modes: [chat], rewrite: { enabled: true } }, undefined, { rewriter: { rewrite: async () => Promise.reject(new Error("401")) } });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.text).toBe("Hello world ");
    expect((await r.dictation.history.list())[0]?.rewrite).toBe("failed");
  });

  it("a writer that is still loading is not waited for: the text goes in as said and the history says why", async () => {
    const chat = mode({ id: "chat", apps: ["notepad"], rewrite: true });
    const r = await rig({ modes: [chat], rewrite: { enabled: true } }, undefined, { rewriter: { rewrite: () => Promise.reject(new WriterLoadingError()) } });
    await r.hold(1000);
    await r.time.advance(200);
    expect(r.ins.inserted[0]?.text).toBe("Hello world ");
    expect((await r.dictation.history.list())[0]?.rewrite).toBe("writer-loading");
  });

  it("rewrites apps in no mode only with a default style chosen, and a mode's own choice wins", async () => {
    const styles: unknown[] = [];
    const rewriter: Rewriter = { rewrite: async ({ text, style }) => (styles.push(style?.template), text) };
    const chat = mode({ id: "chat", apps: ["slack"], rewrite: true, template: "message" });
    const off = await rig({ modes: [chat], rewrite: { enabled: true } }, undefined, { rewriter });
    await off.hold(1000);
    await off.time.advance(200);
    expect(styles).toEqual([]);
    const r = await rig({ modes: [chat], rewrite: { enabled: true }, rewriteDefault: "email" }, undefined, { rewriter });
    for (const exe of ["notepad.exe", "slack.exe"]) {
      r.ins.state.current = target({ exe });
      await r.hold(1000);
      await r.time.advance(200);
    }
    expect(styles).toEqual(["email", "message"]);
  });

  it("does not rewrite when the opt-in switch is off, even in a mode that asks", async () => {
    let called = 0;
    const chat = mode({ id: "chat", apps: ["notepad"], rewrite: true });
    const r = await rig({ modes: [chat], rewrite: { enabled: false } }, undefined, { rewriter: { rewrite: async () => (called++, "x") } });
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
    const ask = (template: "notes" | "tidy") => rewritePass({ text, rewriter: rw, skip: new AbortController().signal, style: { capitals: "sentence", stripFinalStop: false, template } });
    expect((await ask("notes")).outcome).toBe("rewritten");
    expect(await ask("tidy")).toEqual({ text, outcome: "changed-facts" });
  });

  it("gives the writer the template of the mode in use, and no call where the mode has no rewrite", async () => {
    const styles: unknown[] = [];
    const rewriter: Rewriter = { rewrite: async ({ text, style }) => (styles.push(style), text) };
    const chat = mode({ id: "chat", name: "Chat", apps: ["slack"], rewrite: true, template: "message" });
    const r = await rig({ modes: [chat], rewrite: { enabled: true } }, undefined, { rewriter });
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
