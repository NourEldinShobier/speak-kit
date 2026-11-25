import { parseHTML } from "linkedom";
import { act, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Term } from "@speakkit/dictation";
import type { HistoryItem } from "../../../shared/dictation/contract";

const patched = vi.hoisted(() => [] as { terms?: Term[] }[]);
vi.mock("../dictation-bridge", () => ({
  useDictation: () => ({ settings: { terms: [] } }),
  patchDictation: async (p: { terms?: Term[] }) => void patched.push(p),
}));
// The dialog itself needs a browser's layout: this stands in for it with the same props.
vi.mock("@speakkit/ui", async (original) => ({
  ...(await original<typeof import("@speakkit/ui")>()),
  Modal: ({ open, title, children, footer }: { open: boolean; title: string; children: ReactNode; footer: ReactNode }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        {footer}
      </div>
    ) : null,
}));
const { FixDialog } = await import("./FixDialog");
const { createRoot } = await import("react-dom/client");

const item = (over: Partial<HistoryItem> = {}) => ({ id: "e1", text: "i opened cloud code and ran it", ...over }) as HistoryItem;

async function mount(entry: HistoryItem) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
  for (const k of Object.getOwnPropertyNames(window)) if (/^[A-Z]/.test(k) && !(k in globalThis)) (globalThis as Record<string, unknown>)[k] = (window as unknown as Record<string, unknown>)[k];
  patched.length = 0;
  await act(async () => createRoot(document.getElementById("root")!).render(<FixDialog item={entry} onClose={() => undefined} />));
  return document;
}

describe("the Fix dialog", () => {
  it("has no box to copy the corrected text", async () => {
    const d = await mount(item({ app: "code.exe", appName: "Visual Studio Code" }));
    expect(d.body.textContent).not.toContain("Also copy the corrected text");
    expect(d.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  });

  it("names the program in plain words with its file name, only when the entry recorded one", async () => {
    const withApp = await mount(item({ app: "code.exe", appName: "Visual Studio Code" }));
    expect(withApp.body.textContent).toContain("Only when dictating into Visual Studio Code (code.exe)");
    const without = await mount(item());
    expect(without.body.textContent).not.toContain("Only when dictating into");
    expect(without.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("starts for everywhere", async () => {
    const d = await mount(item({ app: "code.exe", appName: "Visual Studio Code" }));
    expect((d.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
  });
});
