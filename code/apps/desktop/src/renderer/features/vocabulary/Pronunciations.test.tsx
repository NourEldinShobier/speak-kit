import { parseHTML } from "linkedom";
import { act } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Pronunciation } from "@speakkit/dictation";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});
const list = vi.hoisted(() => ({ readAs: [] as Pronunciation[] }));
vi.mock("../dictation-bridge", () => ({ useDictation: () => ({ settings: { readAs: list.readAs } }), patchDictation: async () => undefined }));

const { Pronunciations } = await import("./Pronunciations");
const { PreviewCtx } = await import("../../pages");
const { createRoot } = await import("react-dom/client");

async function mount(readAs: Pronunciation[]) {
  list.readAs = readAs;
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
  for (const k of Object.getOwnPropertyNames(window)) if (/^[A-Z]/.test(k) && !(k in globalThis)) (globalThis as Record<string, unknown>)[k] = (window as unknown as Record<string, unknown>)[k];
  const player = { playing: null, error: null, toggle: async () => {} } as never;
  await act(async () =>
    createRoot(document.getElementById("root")!).render(
      <PreviewCtx.Provider value={player}>
        <Pronunciations voice="af_heart" />
      </PreviewCtx.Provider>,
    ),
  );
  return document;
}

describe("the pronunciations on the Voices page", () => {
  it("lists how the reader says each written form, with the voice used for samples", async () => {
    const d = await mount([{ id: "p1", written: "GIF", spoken: "jiff" }]);
    expect(d.querySelector("#vocab-read")?.textContent).toBe("Pronunciations");
    expect(d.querySelector('[data-testid="pron-count"]')?.textContent).toBe("1 of 200 entries");
    expect(d.querySelector("[data-pron=p1]")?.textContent).toContain("GIFjiff");
    expect(d.body.textContent).toContain("Sample voice: Heart");
  });

  it("offers to add the first pronunciation when there are none, and the reader test below", async () => {
    const d = await mount([]);
    expect(d.body.textContent).toContain("No pronunciations yet");
    expect(d.querySelector('[data-testid="spoken-wording"]')?.textContent).toBe("The GIF was deployed with kubectl.");
  });
});
