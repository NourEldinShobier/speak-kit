import { parseHTML } from "linkedom";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { DEFAULT_DICTATION } from "../../../shared/dictation/settings";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitDictation: {} };
});

const current = vi.hoisted(() => ({ status: null as unknown }));
vi.mock("./useDictation", () => ({ useDictation: () => current.status }));
vi.mock("./usePermissions", () => ({ usePermissions: () => null }));
// Radix Select needs a browser's layout, which the fake DOM lacks.
vi.mock("@speakkit/ui", async (original) => ({ ...(await original<typeof import("@speakkit/ui")>()), Select: () => null }));
// The cards below the model row talk to the main process when they mount; only the tabs are under test.
vi.mock("./AudioCards", () => ({ MicrophoneCard: () => null, OutputCard: () => null, FeedbackCard: () => null }));
vi.mock("./OtherAudioCard", () => ({ OtherAudioCard: () => null }));
vi.mock("./ShortcutsSection", () => ({ ShortcutsSections: () => null }));
vi.mock("../vocabulary", () => ({ Cleanup: () => null }));
vi.mock("../engines", () => ({ SpeechModelsSection: () => <section aria-label="Speech models">Compare models Import a model file Performance Disk space</section> }));
vi.mock("../../ui", () => ({ Page: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const { DictationPage } = await import("./DictationPage");
const { requestDictationTab } = await import("../../dictation-tab");
const { createRoot } = await import("react-dom/client");

const turbo = {
  id: "large-v3-turbo-q5_0",
  name: "Whisper Large v3 Turbo",
  tag: "Accurate",
  description: "Best accuracy.",
  bytes: 574_041_195,
  installed: true,
  selected: true,
  languages: ["auto", "en"],
};

const open: { unmount(): void }[] = [];

async function mount() {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  Object.assign(window, { speakkit: {}, speakkitDictation: {} });
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true, HTMLFormElement: class {} }); // Radix Switch asks whether a form wraps it
  for (const k of Object.getOwnPropertyNames(window)) if (/^[A-Z]/.test(k) && !(k in globalThis)) (globalThis as Record<string, unknown>)[k] = (window as unknown as Record<string, unknown>)[k];
  const root = createRoot(document.getElementById("root")!);
  open.push(root);
  await act(async () => root.render(<DictationPage openHistory={() => {}} />));
  return document;
}

const tabs = (d: Document) => Object.fromEntries([...d.querySelectorAll('[role="radio"]')].map((b) => [b.textContent, b.getAttribute("aria-checked")]));
const click = (d: Document, name: string) => act(async () => ([...d.querySelectorAll("button")].find((b) => b.textContent === name) as HTMLElement).click());

beforeEach(() => {
  current.status = {
    supported: true,
    enabled: true,
    settings: { ...DEFAULT_DICTATION, enabled: true },
    models: [turbo],
    modelReady: true,
    mic: { kind: "ready", label: "Microphone Array" },
    devices: [],
  } as unknown as DictationStatus;
});

afterEach(() => act(async () => open.splice(0).forEach((r) => r.unmount())));

describe("Dictation tabs", () => {
  it("opens on Settings, with the model in use and no model sections", async () => {
    const d = await mount();
    expect(tabs(d)).toEqual({ Settings: "true", Models: "false" });
    expect(d.body.textContent).toContain("Test dictation");
    expect(d.body.textContent).toContain("Whisper Large v3 Turbo");
    expect(d.body.textContent).not.toContain("Import a model file");
  });

  it("shows the model sections on the Models tab and the settings again on Settings", async () => {
    const d = await mount();
    await click(d, "Models");
    expect(tabs(d)).toEqual({ Settings: "false", Models: "true" });
    expect(d.body.textContent).toContain("Compare models Import a model file Performance Disk space");
    expect(d.body.textContent).not.toContain("Test dictation");
    await click(d, "Settings");
    expect(d.body.textContent).toContain("Test dictation");
  });

  it("jumps from the Change button to the Models tab", async () => {
    const d = await mount();
    await click(d, "Change");
    expect(tabs(d)).toEqual({ Settings: "false", Models: "true" });
  });

  it("opens on the tab that was asked for before the page opened, and follows a request while it is open", async () => {
    requestDictationTab("models");
    const d = await mount();
    expect(tabs(d).Models).toBe("true");
    await act(async () => requestDictationTab("settings"));
    expect(tabs(d).Settings).toBe("true");
  });
});
