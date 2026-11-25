import { parseHTML } from "linkedom";
import { act } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});
vi.mock("../dictation-bridge", () => ({
  dictation: {},
  patchDictation: async () => undefined,
  useDictation: () => ({ settings: { terms: [], prompt: true, model: "large-v3-turbo-q5_0" }, models: [] }),
}));
// The switch needs a browser's form elements, which the fake DOM lacks: this stands in for it.
vi.mock("@speakkit/ui", async (original) => ({
  ...(await original<typeof import("@speakkit/ui")>()),
  Toggle: (p: { "aria-label"?: string }) => <button aria-label={p["aria-label"]} />,
}));
const { VocabularyPage } = await import("./VocabularyPage");
const { createRoot } = await import("react-dom/client");

async function mount() {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
  for (const k of Object.getOwnPropertyNames(window)) if (/^[A-Z]/.test(k) && !(k in globalThis)) (globalThis as Record<string, unknown>)[k] = (window as unknown as Record<string, unknown>)[k];
  await act(async () => createRoot(document.getElementById("root")!).render(<VocabularyPage />));
  return document;
}

describe("the Vocabulary page", () => {
  it("is the one list of words, with no tabs and no pronunciations", async () => {
    const d = await mount();
    expect(d.querySelectorAll('[role="radio"], [role="tab"]')).toHaveLength(0);
    expect([...d.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Words and names", "No words yet", "Speech model prompt"]);
    expect(d.body.textContent).not.toContain("Pronunciations");
    expect(d.body.textContent).not.toContain("Read as");
  });

  it("still offers Import and Export of the words", async () => {
    const d = await mount();
    const buttons = [...d.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toContain("Import");
    expect(buttons).toContain("Export");
  });
});
