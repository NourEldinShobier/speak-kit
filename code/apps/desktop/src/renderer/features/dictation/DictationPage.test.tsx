import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { DictationStatus, ModelView } from "../../../shared/dictation/contract";
import { DEFAULT_DICTATION } from "../../../shared/dictation/settings";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitDictation: {} };
});

const current = vi.hoisted(() => ({ status: null as unknown }));
vi.mock("./useDictation", () => ({ useDictation: () => current.status }));
const perms = vi.hoisted(() => ({ status: null as unknown }));
vi.mock("./usePermissions", () => ({ usePermissions: () => perms.status }));

import { guideFor } from "../../../shared/permissions/guide";
import { DictationPage } from "./DictationPage";
import { DictationHistoryPage, HistoryRow } from "./HistoryPage";

const turbo: ModelView = {
  id: "large-v3-turbo-q5_0",
  name: "Whisper Large v3 Turbo",
  tag: "Accurate",
  description: "Best accuracy.",
  bytes: 574_041_195,
  installed: true,
  selected: true,
  languages: ["auto", "en", "de", "ar"],
};
const parakeet: ModelView = {
  id: "parakeet-tdt-0.6b-v3-q4_0",
  name: "Parakeet v3",
  tag: "Fast",
  description: "Very fast.",
  bytes: 355_615_679,
  installed: false,
  selected: false,
  languages: ["auto", "en", "de"],
};

const status = (over: Partial<DictationStatus> = {}): DictationStatus => ({
  supported: true,
  enabled: true,
  hotkeyReady: true,
  phase: "idle",
  settings: { ...DEFAULT_DICTATION, enabled: true, hotkey: "ControlLeft+AltLeft+Space", language: "en", replacements: [{ from: "gonna", to: "going to" }] },
  models: [turbo, parakeet],
  modelInstalled: true,
  modelReady: true,
  historyCount: 128,
  paused: false,
  platform: "win32",
  readerShortcuts: {},
  mic: { kind: "ready", label: "Microphone Array" },
  devices: [],
  historyStatus: "ok",
  historyRev: 0,
  keptRecordings: 0,
  rewriteKey: false,
  ...over,
});
const page = (s: DictationStatus | null, open = () => undefined) => ((current.status = s), renderToStaticMarkup(<DictationPage openHistory={open} />));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

beforeEach(() => void ((current.status = null), (perms.status = null)));

describe("Settings > Dictation", () => {
  it("says when the hotkey could not start, and stays quiet otherwise", () => {
    expect(text(page(status({ hotkeyFailed: true })))).toContain("The hotkey could not start Dictation does not hear the hotkey");
    expect(text(page(status()))).not.toContain("The hotkey could not start");
  });

  it("shows the permission guide and points the failed hotkey at the permission that is missing", () => {
    const states = { accessibility: "denied", "input-monitoring": "granted", microphone: "granted", "screen-recording": "not-needed" } as const;
    perms.status = { platform: "darwin", states, guides: { dictation: guideFor(states, "dictation"), "screen-reading": guideFor(states, "screen-reading") } };
    const out = text(page(status({ hotkeyFailed: true })));
    expect(out).toContain("Allow dictation");
    expect(out).toContain("Accessibility");
    expect(out).toContain("The hotkey could not start"); // Windows test run: no Mac platform on the document
  });

  it("shows the volume slider under While dictating only when the other audio is lowered", () => {
    const withMode = (duckAudio: "nothing" | "lower" | "mute" | "pause", duckLevel = 30) => page(status({ settings: { ...status().settings, duckAudio, duckLevel } }));
    const lower = withMode("lower", 45);
    expect(text(lower)).toContain("Volume while dictating 45%");
    expect(lower).toContain('aria-label="Volume while dictating"');
    expect(lower).toContain('aria-valuemin="0" aria-valuemax="100"');
    expect(lower).toContain("right:55%"); // the filled part of the track ends at 45
    for (const mode of ["nothing", "mute", "pause"] as const) expect(withMode(mode)).not.toContain("Volume while dictating");
  });

  it("shows the title before the status has arrived", () => {
    expect(text(page(null))).toContain("Dictation Hold a key, speak");
  });

  it("lists the general settings, the models, the clean-up rules, the test field and the history", () => {
    const t = text(page(status()));
    for (const s of [
      "General",
      "Dictation shortcut",
      "Ctrl",
      "Alt",
      "Space",
      "Change",
      "Shortcut mode",
      "Hold or double-tap",
      "Hold time",
      "300 ms",
      "Dictate without processing",
      "Paste last dictation",
      "Restore default",
      "Speech model",
      "Whisper Large v3 Turbo",
      "Clean-up",
      "Remove filler words",
      "Test dictation",
      "History",
      "View history",
      "128 entries",
    ])
      expect(t).toContain(s);
  });

  it("lists the short list of models and points to the Engines page for the rest, unless a hidden one is installed or downloading", () => {
    const more = (id: string, over: Partial<ModelView> = {}): ModelView => ({ ...parakeet, id: id as ModelView["id"], name: `Extra ${id}`, more: true, ...over });
    const html = page(status({ models: [turbo, parakeet, more("tiny"), more("base"), more("small", { installed: true }), more("medium", { progress: { kind: "preparing" } })] }));
    expect(html).not.toContain("Extra tiny");
    expect(html).not.toContain("Extra base");
    expect(html).toContain("Extra small");
    expect(html).toContain("Extra medium");
    expect(html).toContain("2 more models are on the Engines page.");
    expect(page(status({ models: [turbo, parakeet, more("tiny")] }))).toContain("1 more model is on the Engines page.");
    expect(page(status())).not.toContain("on the Engines page");
  });

  it("marks the chosen model, offers Download for the one that is not on disk, and only the recommended one carries Recommended", () => {
    const html = page(status());
    expect(html).toContain("Installed");
    expect(html).toContain("Download");
    expect(html.match(/>Recommended</g)).toHaveLength(1);
    expect(html).toMatch(/<input[^>]*aria-label="Whisper Large v3 Turbo"[^>]*checked/);
    expect(html).toMatch(/<input[^>]*disabled[^>]*aria-label="Parakeet v3"/);
    expect(html).not.toContain("lm-field__label"); // the tester field carries no visible label
  });

  it("shows a download in progress with Cancel and the size done", () => {
    const t = text(page(status({ models: [turbo, { ...parakeet, progress: { kind: "downloading", fraction: 0.38, etaSeconds: 120 } }] })));
    expect(t).toContain("Downloading 38%, 135 of 356 MB. About 2 minutes left.");
    expect(t).toContain("Cancel");
  });

  it("leaves out Arabic for a model that cannot do it", () => {
    const onParakeet = status({
      models: [
        { ...turbo, selected: false },
        { ...parakeet, installed: true, selected: true },
      ],
    });
    // The language list is the Language select; the clean-up scope chips name Arabic for the rules that have a table.
    expect(text(page(onParakeet)).match(/Arabic/g)).toHaveLength(1);
  });

  it("says when dictation cannot run on this platform, and the switch is disabled", () => {
    const html = page(status({ supported: false, enabled: false }));
    expect(text(html)).toContain("Not supported on this platform yet");
    expect(html).toMatch(/role="switch"[^>]*disabled/);
  });

  it("keeps the whole page and asks for a model, without starting a download, when none is installed", () => {
    const t = text(page(status({ models: [{ ...turbo, installed: false }, parakeet], modelReady: false, modelInstalled: false })));
    expect(t).toContain("Choose a speech model");
    expect(t).toContain("Download");
    expect(t).toContain("Clean-up");
    expect(t).not.toContain("Set up dictation");
  });

  it("shows a download in the model's own row and keeps the rest of the page", () => {
    const t = text(page(status({ models: [{ ...turbo, installed: false, progress: { kind: "downloading", fraction: 0.63, etaSeconds: 60 } }, parakeet], modelReady: false, modelInstalled: false })));
    expect(t).toContain("Downloading 63%");
    expect(t).toContain("Clean-up");
  });

  it("does not take the page away while a second model downloads", () => {
    const t = text(page(status({ modelReady: false, models: [turbo, { ...parakeet, progress: { kind: "downloading", fraction: 0.1 } }] })));
    expect(t).toContain("Clean-up");
    expect(t).not.toContain("Set up dictation");
  });

  it("shows a failed second download as a notice on the page", () => {
    const t = text(page(status({ modelError: "The download was cut off." })));
    expect(t).toContain("The speech model could not be set up The download was cut off.");
    expect(t).toContain("Clean-up");
  });

  it("says the chosen model is not loaded yet and keeps the page", () => {
    const t = text(page(status({ modelReady: false })));
    expect(t).toContain("Whisper Large v3 Turbo is not loaded");
    expect(t).toContain("Clean-up");
  });

  it("offers Try again beside a failed model setup", () => {
    const t = text(page(status({ modelError: "No space left on the disk.", modelReady: false })));
    expect(t).toContain("No space left on the disk.");
    expect(t).toContain("Try again");
    expect(t).toContain("Clean-up");
  });

  it("puts the hint and the test field first, then the general settings and the speech model", () => {
    const t = text(page(status()));
    expect(t.indexOf("Test dictation")).toBeLessThan(t.indexOf("General"));
    expect(t.indexOf("hold")).toBeGreaterThan(-1);
  });

  it("says a lost microphone at the top, and says nothing about a healthy listener", () => {
    const bad = text(page(status({ mic: { kind: "lost" } as never, hotkeyReady: true })));
    expect(bad.indexOf("No microphone")).toBeLessThan(bad.indexOf("General"));
    expect(text(page(status({ mic: { kind: "none" } as never, hotkeyReady: true }))).indexOf("No usable microphone")).toBe(-1);
    expect(text(page(status({ hotkeyReady: true })))).not.toContain("Running");
  });

  it("puts the speech model card right after the general settings", () => {
    const t = text(page(status()));
    expect(t.indexOf("Speech model")).toBeGreaterThan(t.indexOf("General"));
    expect(t.indexOf("Speech model")).toBeLessThan(t.indexOf("Clean-up"));
  });
});

describe("history page", () => {
  it("shows the empty state with the hotkey, and no totals", () => {
    current.status = status({ historyCount: 0 });
    const html = renderToStaticMarkup(<DictationHistoryPage embedded openSettings={() => undefined} />);
    expect(text(html)).toContain("Nothing dictated yet");
    expect(text(html)).toContain("Hold the hotkey in any app and speak. What you dictate shows up here for 7 days.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<svg[^>]*>.*?<\/svg>)?\s*Copy recent/);
    expect(text(html)).not.toContain("Listening time");
  });

  it("has the lead, the search field and the two views before the entries have loaded", () => {
    current.status = status();
    const html = renderToStaticMarkup(<DictationHistoryPage embedded openSettings={() => undefined} />);
    const t = text(html);
    expect(html).toContain('placeholder="Search what you dictated"');
    expect(t).toContain("Clear all");
    expect(t).toContain("Statistics");
    expect(t).toContain("Select");
    expect(t).toContain("Final text");
    expect(t).toContain("Side by side");
    expect(t).toContain("Copy recent");
    expect(html).toContain('aria-label="More history actions"');
  });

  it("warns when the file came from a newer Speak Kit, with a way to check for updates", () => {
    current.status = status({ historyStatus: "newer" });
    const t = text(renderToStaticMarkup(<DictationHistoryPage embedded openSettings={() => undefined} />));
    expect(t).toContain("This history was saved by a newer Speak Kit");
    expect(t).toContain("left unchanged and a copy was made");
    expect(t).toContain("Check for updates");
    current.status = status();
    expect(text(renderToStaticMarkup(<DictationHistoryPage embedded openSettings={() => undefined} />))).not.toContain("newer Speak Kit");
  });

  it("tells the person when the history file could not be read, naming the kept copy", () => {
    current.status = status({ historyStatus: "unreadable", historyCopy: "history.unreadable-5.json" });
    const t = text(renderToStaticMarkup(<DictationHistoryPage embedded openSettings={() => undefined} />));
    expect(t).toContain("The history file could not be read");
    expect(t).toContain("A copy was kept as history.unreadable-5.json next to it.");
    current.status = status({ historyStatus: "unreadable" });
    expect(text(renderToStaticMarkup(<DictationHistoryPage embedded openSettings={() => undefined} />))).not.toContain("A copy was kept");
    current.status = status();
  });

  it("reports recordings the Recycle Bin would not take, with the count", () => {
    current.status = status({ keptRecordings: 2 });
    const t = text(renderToStaticMarkup(<DictationHistoryPage embedded openSettings={() => undefined} />));
    expect(t).toContain("A recording could not be moved to the Recycle Bin");
    expect(t).toContain("2 files are still in Speak Kit");
    current.status = status({ keptRecordings: 1 });
    expect(text(renderToStaticMarkup(<DictationHistoryPage embedded openSettings={() => undefined} />))).toContain("The file is still in");
  });
});

describe("history rows", () => {
  const item = { id: "e1", at: 1_700_000_000_000, text: "Send the report to Dana by Friday", raw: "send the report to dana by friday", durationMs: 3000, expiresInMs: null, app: "chrome.exe" };
  const row = (copied: boolean) => renderToStaticMarkup(<HistoryRow item={item} copied={copied} onCopy={() => undefined} onDelete={() => undefined} />);

  it("names both buttons after the entry, so a screen reader can tell the rows apart", () => {
    const html = row(false);
    expect(html).toContain('aria-label="Copy: Send the report to Dana by Friday"');
    expect(html).toContain('aria-label="Delete: Send the report to Dana by Friday"');
  });

  it("keeps both buttons after a copy and announces it in a status region", () => {
    const html = row(true);
    expect(html).toContain('aria-label="Copy: Send the report to Dana by Friday"');
    expect(html).toContain('aria-label="Delete: Send the report to Dana by Friday"');
    expect(html).toContain('<span class="dict-hist__sr" role="status">Copied</span>');
    expect(html).toContain("data-copied");
    expect(row(false)).toContain('<span class="dict-hist__sr" role="status"></span>');
    expect(row(false)).not.toContain("data-copied");
  });
});

describe("history rows, details and selection", () => {
  const base = { id: "e1", at: 1_700_000_000_000, text: "Send the report", raw: "send the report", durationMs: 3000, expiresInMs: null };
  const html = (item: object, selection?: { checked: boolean; toggle: () => void }) =>
    renderToStaticMarkup(<HistoryRow item={{ ...base, ...item }} copied={false} onCopy={() => undefined} onDelete={() => undefined} {...(selection && { selection })} />);

  it("shows the program's own name and a note for an interrupted entry that was only copied", () => {
    const h = html({ app: "code.exe", appName: "Visual Studio Code", kind: "interrupted", outcome: "copied" });
    expect(h).toContain("Visual Studio Code");
    expect(h).toContain(">Cut short<");
    expect(h).toContain(">Copied only<");
  });

  it("says when the text could not be inserted, and tags nothing for a normal entry", () => {
    expect(html({ outcome: "failed" })).toContain(">Not inserted<");
    expect(html({ outcome: "sent" })).not.toContain("dict-hist__tag");
  });

  it("has a named checkbox only in selection mode", () => {
    expect(html({})).not.toContain('type="checkbox"');
    const h = html({}, { checked: true, toggle: () => undefined });
    expect(h).toContain('aria-label="Select: Send the report"');
    expect(h).toContain("checked");
  });
});
