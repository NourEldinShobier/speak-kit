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

/** Types into the box. The fake DOM has no input event, so React listens for a change through focus and key-up, the way it does in old browsers, which needs these two methods. */
async function edit(d: Document, text: string) {
  const area = d.querySelector("textarea") as HTMLTextAreaElement;
  Object.assign(area, { attachEvent: () => undefined, detachEvent: () => undefined });
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(area), "value")?.set;
  await act(async () => area.dispatchEvent(new window.Event("focusin", { bubbles: true })));
  await act(async () => {
    set?.call(area, text);
    area.dispatchEvent(new window.Event("keyup", { bubbles: true }));
  });
}

const lines = (d: Document) => [...d.querySelectorAll('[aria-label="Fixes found"] li')].map((li) => li.textContent);
const button = (d: Document, text: string) => [...d.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;

describe("the Fix dialog", () => {
  it("shows one hint and a disabled Save until a fix is found", async () => {
    const d = await mount(item());
    expect(d.body.textContent).toContain("Change only the misheard words");
    expect(lines(d)).toEqual([]);
    expect(button(d, "Save").disabled).toBe(true);
  });

  it("shows one line per fix as the text is edited, and no checkbox, scope question or copy box", async () => {
    const d = await mount(item({ app: "code.exe", appName: "Visual Studio Code" }));
    await edit(d, "i opened Claude Code and ran it");
    expect(lines(d)).toEqual(["cloud code → Claude Code"]);
    expect(d.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(d.body.textContent).not.toContain("Only when dictating into");
    expect(d.body.textContent).not.toContain("copy");
  });

  it("takes a line away with its remove button", async () => {
    const d = await mount(item());
    await edit(d, "i opened Claude Code and ran it");
    await act(async () => (d.querySelector('[aria-label="Remove cloud code → Claude Code"]') as HTMLElement).click());
    expect(lines(d)).toEqual([]);
    expect(button(d, "Save").disabled).toBe(true);
  });

  it("saves the fix as a word that applies at once, limited to the program for everyday words", async () => {
    const d = await mount(item({ app: "Code.exe" }));
    await edit(d, "i opened Claude Code and ran it");
    await act(async () => button(d, "Save").click());
    expect(patched).toHaveLength(1);
    expect(patched[0]?.terms).toMatchObject([{ word: "Claude Code", soundsLike: ["cloud code"], app: "code", learned: { heard: "cloud code", count: 1, sources: ["e1"] } }]);
    expect(patched[0]?.terms?.[0]).not.toHaveProperty("suggested");
  });

  it("saves a fix of distinctive words for every program", async () => {
    const d = await mount(item({ text: "we run kubernetis daily", app: "Code.exe" }));
    await edit(d, "we run Kubernetes daily");
    await act(async () => button(d, "Save").click());
    expect(patched[0]?.terms).toMatchObject([{ word: "Kubernetes", soundsLike: ["kubernetis"] }]);
    expect(patched[0]?.terms?.[0]).not.toHaveProperty("app");
  });
});
