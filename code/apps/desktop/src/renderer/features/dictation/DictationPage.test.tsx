import { parse } from "valibot";
import { DictationConfigSchema } from "../../../shared/dictation/settings";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { DictationStatus, ModelView } from "../../../shared/dictation/contract";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitDictation: {} };
});

const current = vi.hoisted(() => ({ status: null as unknown }));
vi.mock("./useDictation", () => ({ useDictation: () => current.status }));

import { DictationPage } from "./DictationPage";
import { FirstRunCard } from "./FirstRunCard";
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
  settings: parse(DictationConfigSchema, {
    enabled: true,
    hotkey: "ControlLeft+AltLeft+Space",
    mode: "hold",
    language: "en",
    model: "large-v3-turbo-q5_0",
    retention: "7d",
    replacements: [{ from: "gonna", to: "going to" }],
  }),
  models: [turbo, parakeet],
  modelInstalled: true,
  modelReady: true,
  historyCount: 128,
  historyStatus: "ok",
  historyRev: 0,
  keptRecordings: 0,
  rewriteKey: false,
  ...over,
});
const page = (s: DictationStatus | null, open = () => undefined) => ((current.status = s), renderToStaticMarkup(<DictationPage openHistory={open} />));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

beforeEach(() => void (current.status = null));

describe("Settings > Dictation", () => {
  it("says when the hotkey could not start, and stays quiet otherwise", () => {
    expect(text(page(status({ hotkeyFailed: true })))).toContain("The hotkey could not start Dictation does not hear the hotkey");
    expect(text(page(status()))).not.toContain("The hotkey could not start");
  });

  it("shows the title before the status has arrived", () => {
    expect(text(page(null))).toContain("Dictation Hold a key, speak");
  });

  it("lists the general settings, the models, the clean-up rules, the test field and the history", () => {
    const t = text(page(status()));
    for (const s of [
      "General",
      "Hotkey",
      "Ctrl",
      "Alt",
      "Space",
      "Change",
      "Hold to talk",
      "Press to toggle",
      "Speech model",
      "Whisper Large v3 Turbo",
      "Clean-up",
      "Remove filler words",
      "Try a sentence",
      "Test dictation",
      "History",
      "View history",
      "128 entries",
    ])
      expect(t).toContain(s);
  });

  it("marks the chosen model, offers Download for the one that is not on disk, and only the default carries Default", () => {
    const html = page(status());
    expect(html).toContain("Installed");
    expect(html).toContain("Download");
    expect(html.match(/>Default</g)).toHaveLength(1);
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

  it("shows the set-up card instead of the settings while the chosen model is not installed", () => {
    const t = text(page(status({ models: [{ ...turbo, installed: false, progress: { kind: "downloading", fraction: 0.63, etaSeconds: 60 } }, parakeet], modelReady: false, modelInstalled: false })));
    expect(t).toContain("Set up dictation");
    expect(t).not.toContain("Clean-up");
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

  it("shows only the card when the chosen model is loading", () => {
    const t = text(page(status({ modelReady: false })));
    expect(t).toContain("Preparing the model");
    expect(t).not.toContain("Clean-up");
  });
});

describe("first run card", () => {
  const card = (s: DictationStatus) => text(renderToStaticMarkup(<FirstRunCard status={s} />));

  it("step 1 shows the download with percent, size and time left", () => {
    const t = card(status({ models: [{ ...turbo, installed: false, bytes: 466_000_000, progress: { kind: "downloading", fraction: 0.63, etaSeconds: 60 } }, parakeet], modelInstalled: false }));
    expect(t).toContain("Step 1 of 2");
    expect(t).toContain("63%");
    expect(t).toContain("294 of 466 MB. About 1 minute left.");
    expect(t).toContain("Speak Kit needs a speech model on this computer. It downloads once, then dictation works offline.");
  });

  it("step 2 says the model is being prepared and which keys to hold", () => {
    const t = card(status({ modelReady: false }));
    expect(t).toContain("Step 2 of 2");
    expect(t).toContain("Getting Whisper Large v3 Turbo ready. This takes a few seconds the first time.");
    expect(t).toContain("When it is ready, hold Ctrl Alt Space and speak.");
  });

  it("a failure offers Turn off and Try again", () => {
    const t = card(status({ modelError: "No space left on the disk.", modelReady: false }));
    expect(t).toContain("No space left on the disk.");
    expect(t).toContain("Turn off");
    expect(t).toContain("Try again");
  });
});

describe("history page", () => {
  it("shows the empty state with the hotkey, and no totals", () => {
    current.status = status({ historyCount: 0 });
    const html = renderToStaticMarkup(<DictationHistoryPage openDictation={() => undefined} />);
    expect(text(html)).toContain("Nothing dictated yet");
    expect(text(html)).toContain("Hold the hotkey in any app and speak. What you dictate shows up here for 7 days.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<svg[^>]*>.*?<\/svg>)?\s*Copy recent/);
    expect(text(html)).not.toContain("Listening time");
  });

  it("has the lead, the search field and the two views before the entries have loaded", () => {
    current.status = status();
    const html = renderToStaticMarkup(<DictationHistoryPage openDictation={() => undefined} />);
    const t = text(html);
    expect(t).toContain("History What you dictated, saved on this computer for 7 days.");
    expect(html).toContain('placeholder="Search what you dictated"');
    expect(t).toContain("Final text");
    expect(t).toContain("Side by side");
    expect(t).toContain("Copy recent");
    expect(html).toContain('aria-label="More history actions"');
  });

  it("warns when the file came from a newer Speak Kit, with a way to check for updates", () => {
    current.status = status({ historyStatus: "newer" });
    const t = text(renderToStaticMarkup(<DictationHistoryPage openDictation={() => undefined} />));
    expect(t).toContain("This history was saved by a newer Speak Kit");
    expect(t).toContain("left unchanged and a copy was made");
    expect(t).toContain("Check for updates");
    current.status = status();
    expect(text(renderToStaticMarkup(<DictationHistoryPage openDictation={() => undefined} />))).not.toContain("newer Speak Kit");
  });

  it("reports recordings the Recycle Bin would not take, with the count", () => {
    current.status = status({ keptRecordings: 2 });
    const t = text(renderToStaticMarkup(<DictationHistoryPage openDictation={() => undefined} />));
    expect(t).toContain("A recording could not be moved to the Recycle Bin");
    expect(t).toContain("2 files are still in Speak Kit");
    current.status = status({ keptRecordings: 1 });
    expect(text(renderToStaticMarkup(<DictationHistoryPage openDictation={() => undefined} />))).toContain("The file is still in");
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
