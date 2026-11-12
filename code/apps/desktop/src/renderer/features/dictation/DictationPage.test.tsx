import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { DictationStatus, ModelView } from "../../../shared/dictation/contract";
import { DEFAULT_DICTATION } from "../../../shared/dictation/settings";

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
  settings: { ...DEFAULT_DICTATION, enabled: true, hotkey: "ControlLeft+AltLeft+Space", language: "en", replacements: [{ from: "gonna", to: "going to" }] },
  models: [turbo, parakeet],
  modelInstalled: true,
  modelReady: true,
  historyCount: 128,
  mic: { kind: "ready", label: "Microphone Array" },
  devices: [],
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

  it("lists the general settings, the models, the replacements, the test field and the history", () => {
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
      "Skipped microphones",
      "Nothing is skipped by name.",
      "Speech model",
      "Whisper Large v3 Turbo",
      "Replacements",
      "gonna",
      "going to",
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
    expect(html).not.toContain("lm-field__label"); // the replacement fields carry no visible label
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
    expect(page(onParakeet)).not.toContain("Arabic");
  });

  it("says when dictation cannot run on this platform, and the switch is disabled", () => {
    const html = page(status({ supported: false, enabled: false }));
    expect(text(html)).toContain("Not supported on this platform yet");
    expect(html).toMatch(/role="switch"[^>]*disabled/);
  });

  it("shows the set-up card instead of the settings while the chosen model is not installed", () => {
    const t = text(page(status({ models: [{ ...turbo, installed: false, progress: { kind: "downloading", fraction: 0.63, etaSeconds: 60 } }, parakeet], modelReady: false, modelInstalled: false })));
    expect(t).toContain("Set up dictation");
    expect(t).not.toContain("Replacements");
  });

  it("does not take the page away while a second model downloads", () => {
    const t = text(page(status({ modelReady: false, models: [turbo, { ...parakeet, progress: { kind: "downloading", fraction: 0.1 } }] })));
    expect(t).toContain("Replacements");
    expect(t).not.toContain("Set up dictation");
  });

  it("shows a failed second download as a notice on the page", () => {
    const t = text(page(status({ modelError: "The download was cut off." })));
    expect(t).toContain("The speech model could not be set up The download was cut off.");
    expect(t).toContain("Replacements");
  });

  it("shows only the card when the chosen model is loading", () => {
    const t = text(page(status({ modelReady: false })));
    expect(t).toContain("Preparing the model");
    expect(t).not.toContain("Replacements");
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
  it("shows the empty state with the hotkey", () => {
    current.status = status({ historyCount: 0 });
    const html = renderToStaticMarkup(<DictationHistoryPage back={() => undefined} />);
    expect(text(html)).toContain("Nothing dictated yet");
    expect(text(html)).toContain("Hold the hotkey in any app and speak. What you dictate shows up here for 7 days.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Clear all/);
  });

  it("has the way back, the lead and a search field before the entries have loaded", () => {
    current.status = status();
    const html = renderToStaticMarkup(<DictationHistoryPage back={() => undefined} />);
    const t = text(html);
    expect(t).toContain("Dictation history");
    expect(t).toContain("What you dictated, saved on this computer for 7 days.");
    expect(html).toContain('placeholder="Search what you dictated"');
    expect(t).toContain("Clear all");
  });
});

describe("history rows", () => {
  const item = { id: "e1", at: 1_700_000_000_000, text: "Send the report to Dana by Friday", app: "chrome.exe" };
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

describe("replacement rows", () => {
  it("use the full-size icon button, not the small one", () => {
    const html = page(status());
    expect(html).toContain('class="lm-btn lm-btn--icon dict-repl__del"');
    expect(html).not.toContain("lm-btn--sm dict-repl__del");
  });
});
