import { describe, expect, it } from "vite-plus/test";
import type { Voice } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";
import { buildCommands, DEFAULT_RECENT, type Command, filterCommands, paletteView, rememberCommand } from "./model";

const voices: Voice[] = [
  { id: "af_bella", name: "Bella", lang: "en-US", gender: "female", quality: "A", traits: "warm" },
  { id: "bm_george", name: "George", lang: "en-GB", gender: "male", quality: "C" },
];
const doc = (id: string, title: string, wordCount: number) => ({ id, title, wordCount, origin: "example.com" }) as DocMeta;
const docs = [doc("d1", "Meeting notes 12 Nov", 320), doc("d2", "Chapter 4 draft", 40)];
const all = buildCommands(voices, docs);
const titles = (q: string) => filterCommands(all, q).map((c) => c.title);

describe("commands", () => {
  it("has no New reading command", () => {
    expect(all.some((c) => /new reading/i.test(c.title))).toBe(false);
  });
  it("opens the Dictation page with a keyboard icon", () => {
    const c = all.find((x) => x.id === "page-dictation")!;
    expect([c.title, c.icon, c.action]).toEqual(["Open Dictation", "keyboard", { type: "nav", page: "dictation" }]);
  });
  it("has a page command for every menu item and a settings command for every settings page", () => {
    expect(all.filter((c) => c.group === "Pages")).toHaveLength(10);
    expect(all.filter((c) => c.group === "Settings")).toHaveLength(14);
  });
  it("builds readings with minutes and voices with a Voice hint", () => {
    expect(all.find((c) => c.id === "d-d1")).toMatchObject({ group: "Readings", hint: "2 min", action: { type: "open-doc", id: "d1" } });
    expect(all.find((c) => c.id === "d-d2")!.hint).toBe("1 min");
    expect(all.find((c) => c.id === "v-af_bella")).toMatchObject({ title: "Bella", hint: "Voice" });
  });
});

describe("filter", () => {
  it("matches nothing for an empty or blank query", () => {
    expect(titles("")).toEqual([]);
    expect(titles("   ")).toEqual([]);
  });
  it("finds a voice by name and by id, case-insensitively", () => {
    expect(titles("BELLA")).toEqual(["Bella"]);
    expect(titles("bm_geo")).toEqual(["George"]);
  });
  it("finds readings by title and origin", () => {
    expect(titles("chapter")).toEqual(["Chapter 4 draft"]);
    expect(titles("example.com")).toEqual(["Meeting notes 12 Nov", "Chapter 4 draft"]);
  });
  it("matches keywords and requires every word", () => {
    expect(titles("idle")).toEqual(["Settings: Performance"]);
    expect(titles("settings performance")).toEqual(["Settings: Performance"]);
    expect(titles("performance zzz")).toEqual([]);
  });
  it("ranks a title that starts with the word first", () => {
    expect(titles("pause")[0]).toBe("Pause");
  });
  it("offers the system actions", () => {
    expect(filterCommands(all, "clipboard")).toEqual([]);
    expect(filterCommands(all, "mp3")[0]!.action).toEqual({ type: "export" });
    expect(filterCommands(all, "disturb")[0]!.action).toEqual({ type: "dnd" });
    expect(filterCommands(all, "chrome")[0]!.action).toEqual({ type: "install-extension" });
    expect(filterCommands(all, "global keys")[0]!.action).toEqual({ type: "nav", page: "settings", sub: "shortcuts" });
    expect(filterCommands(all, "browser integration")[0]!.action).toEqual({ type: "nav", page: "settings", sub: "browser" });
  });
  it("returns at most 30 results", () => {
    const many = buildCommands(
      [],
      Array.from({ length: 80 }, (_, i) => doc(`x${i}`, `Note ${i}`, 10)),
    );
    expect(filterCommands(many, "note")).toHaveLength(30);
  });
});

describe("view", () => {
  it("empty query shows Recent from the defaults, then the other actions, and no voices", () => {
    const v = paletteView(all, "", []);
    expect(v.best).toBeNull();
    expect(v.sections.map((s) => s.label)).toEqual(["Recent", "Actions"]);
    expect(v.sections[0]!.items.map((c) => c.title)).toEqual(["Open Dictation", "Play or pause reading", "Export audio"]);
    expect(v.sections[1]!.items.map((c) => c.title)).not.toContain("Export audio");
    expect(v.flat.some((c) => c.group === "Voices" || c.group === "Readings")).toBe(false);
    expect(DEFAULT_RECENT).toHaveLength(3);
  });
  it("shows the commands that were run, newest first, and skips ids that no longer exist", () => {
    const v = paletteView(all, "", ["logs", "gone", "pause"]);
    expect(v.sections[0]!.items.map((c) => c.id)).toEqual(["logs", "pause"]);
  });
  it("a query gives the best match first, then the rest grouped by kind", () => {
    const v = paletteView(all, "e", []);
    expect(v.best).toBe(v.flat[0]);
    expect(v.sections.every((s) => !s.items.includes(v.best!))).toBe(true);
    expect(v.flat).toHaveLength(filterCommands(all, "e").length);
    const labels = v.sections.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
  it("a query with no match has no best card and no sections", () => {
    expect(paletteView(all, "dictatn zz", [])).toEqual({ best: null, sections: [], flat: [] });
  });
  it("walks the keys in the order drawn", () => {
    const v = paletteView(all, "o", []);
    expect(v.flat).toEqual([v.best, ...v.sections.flatMap((s) => s.items)]);
  });
});

describe("rememberCommand", () => {
  it("puts the newest first without repeats and keeps three", () => {
    expect(rememberCommand(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(rememberCommand(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
  });
});

describe("command table", () => {
  const row = (id: string) => {
    const { action, ...c } = all.find((x) => x.id === id)!;
    return [c.group, c.title, c.does, c.icon, c.keywords, action];
  };
  it("every action has its literal title, description, icon and keywords", () => {
    expect(row("pause")).toEqual(["Actions", "Pause", "Pauses the reading that is playing.", "player-pause", "stop playback", { type: "pause" }]);
    expect(row("toggle-reading")).toEqual(["Actions", "Play or pause reading", "Plays or pauses the current reading.", "player-play", "resume mini player", { type: "toggle-reading" }]);
    expect(row("export")).toEqual(["Actions", "Export audio", "Opens the export dialog to save speech as an audio file.", "download", "save mp3 wav file", { type: "export" }]);
    expect(row("load-engine")).toEqual(["Actions", "Load the voice engine now", "Loads the voice engine into memory so the next reading starts at once.", "cpu", "wake warm", { type: "load-engine" }]);
    expect(row("dnd")).toEqual(["Actions", "Toggle Do not disturb", "Turns pop-ups and sounds off, or back on.", "bell", "notifications quiet toast", { type: "dnd" }]);
    expect(row("check-updates")).toEqual(["Actions", "Check for updates", "Looks for a newer version of Speak Kit.", "refresh", "version upgrade", { type: "check-updates" }]);
    expect(row("install-extension")).toEqual([
      "Actions",
      "Install the extension",
      "Opens Browser integration, where you add the extension.",
      "brand-chrome",
      "chrome edge browser load unpacked",
      { type: "install-extension" },
    ]);
    expect(row("copy-token")).toEqual(["Actions", "Copy pairing token", "Copies the token the extension needs to the clipboard.", "copy", "browser extension key", { type: "copy-token" }]);
    expect(row("logs")).toEqual(["Actions", "Open log folder", "Shows the folder with the log files.", "folder", "debug", { type: "open-logs" }]);
  });
  it("page and settings commands say what they open", () => {
    expect(row("page-library")).toEqual(["Pages", "Open Library", "Opens the Library page.", "book", expect.any(String), { type: "nav", page: "library" }]);
    expect(row("s-shortcuts")).toEqual(["Settings", "Settings: Shortcuts", "Opens Settings on Shortcuts.", "keyboard", expect.any(String), { type: "nav", page: "settings", sub: "shortcuts" }]);
  });
  it("a reading says it opens in the Library; its time rounds to the nearest minute, at least one", () => {
    const [a, b, c, d] = buildCommands([], [doc("a", "A", 0), doc("b", "B", 400), doc("c", "C", 399), doc("d", "D", 1600)]).filter((x) => x.group === "Readings");
    expect([a!.hint, b!.hint, c!.hint, d!.hint]).toEqual(["1 min", "3 min", "2 min", "10 min"]);
    expect([a!.does, a!.icon, a!.keywords]).toEqual(["Opens this reading in the Library.", "book", "example.com"]);
  });
  it("a voice says it plays a sample and carries region, gender and traits as keywords", () => {
    const [bella, george] = buildCommands(voices).filter((x) => x.group === "Voices");
    expect([bella!.does, bella!.icon, bella!.keywords]).toEqual(["Plays a short sample of this voice.", "microphone", "voice preview af_bella us female warm"]);
    expect(george!.keywords).toBe("voice preview bm_george uk male ");
  });
});

describe("ranking", () => {
  const cmd = (id: string, title: string, keywords?: string): Command => ({ id, group: "Actions", title, does: "", icon: "bell", action: { type: "pause" }, ...(keywords ? { keywords } : {}) });
  const rank = (list: Command[], q: string) => filterCommands(list, q).map((c) => c.id);
  it("orders by start of title, start of a word, inside a word, then keyword only", () => {
    const list = [cmd("kw", "Zebra", "alpha"), cmd("mid", "Xalpha"), cmd("word", "Big alpha"), cmd("start", "Alpha one")];
    expect(rank(list, "alpha")).toEqual(["start", "word", "mid", "kw"]);
  });
  it("keeps the list order for equal scores and adds up the cost of every word", () => {
    const list = [cmd("b", "Beta"), cmd("a", "Beta two"), cmd("c", "Gamma beta")];
    expect(rank(list, "beta")).toEqual(["b", "a", "c"]);
    expect(rank([cmd("far", "Aaa xbbb"), cmd("near", "Aaa bbb")], "aaa bbb")).toEqual(["near", "far"]);
  });
  it("matches the group name as a keyword", () => {
    expect(filterCommands(all, "voices").some((c) => c.group === "Voices")).toBe(true);
    expect(rank([cmd("x", "Thing")], "actions")).toEqual(["x"]);
  });
  it("shows the commands run before in place of the defaults, and falls back to the defaults for an empty list", () => {
    expect(paletteView(all, "  ", ["logs"]).sections[0]).toMatchObject({ label: "Recent" });
    expect(paletteView(all, "", ["logs"]).sections[0]!.items.map((c) => c.id)).toEqual(["logs"]);
    expect(paletteView(all, "", []).sections[0]!.items.map((c) => c.id)).toEqual(DEFAULT_RECENT);
  });
  it("Actions on open leaves out the recent ones and lists only actions", () => {
    const v = paletteView(all, "", ["logs"]);
    const actions = v.sections.find((s) => s.label === "Actions")!.items;
    expect(actions.every((c) => c.group === "Actions")).toBe(true);
    expect(actions.map((c) => c.id)).not.toContain("logs");
    expect(actions).toHaveLength(8);
  });
});

describe("remaining literals", () => {
  it("a voice previews that voice and a query with tabs or repeated spaces splits into words", () => {
    expect(all.find((c) => c.id === "v-af_bella")!.action).toEqual({ type: "preview", voice: "af_bella" });
    expect(titles("settings 	  performance")).toEqual(["Settings: Performance"]);
  });
  it("each section holds only commands of its own group, in list order", () => {
    const v = paletteView(all, "o", []);
    for (const sec of v.sections) expect(sec.items.every((c) => c.group === sec.label)).toBe(true);
    expect(v.sections.length).toBeGreaterThan(1);
  });
  it("commands built without readings or voices have none", () => {
    expect(buildCommands().filter((c) => c.group === "Readings" || c.group === "Voices")).toEqual([]);
  });
  it("a command without keywords still matches its title and group, and equal scores keep list order", () => {
    const a = { id: "a", group: "Pages", title: "Same", does: "", icon: "bell", action: { type: "pause" } } as Command;
    const b = { ...a, id: "b" } as Command;
    expect(filterCommands([b, a], "same").map((c) => c.id)).toEqual(["b", "a"]);
    expect(filterCommands([a], "pages")).toEqual([a]);
    expect(filterCommands([a], "undefined")).toEqual([]);
    expect(filterCommands([a], "stryker")).toEqual([]);
  });
});
