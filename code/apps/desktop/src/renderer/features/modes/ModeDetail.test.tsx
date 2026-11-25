import { parseHTML } from "linkedom";
import { act, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { defaultMode, TEMPLATES, type WritingMode } from "@speakkit/dictation";
import type { SelectProps } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";

// Radix needs a browser's layout and pointer events, which the fake DOM lacks: this stands in for the Select with the same props.
vi.mock("@speakkit/ui", async (original) => ({
  ...(await original<typeof import("@speakkit/ui")>()),
  Select: ({ label, value, options, disabled, onChange, renderValue }: SelectProps) => (
    <div>
      <button aria-label={label} disabled={disabled}>
        {renderValue ? renderValue(options.find((o) => o.value === value)) : options.find((o) => o.value === value)?.label}
      </button>
      <ul aria-label={`${label} options`}>
        {options.map((o) => (
          <li key={o.value} onClick={() => onChange?.(o.value)}>
            {o.label}
          </li>
        ))}
      </ul>
    </div>
  ),
}));
vi.mock("../../ui", () => ({ Page: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("../vocabulary", () => ({ WordDialog: () => null }));
const { ModeDetail } = await import("./ModeDetail");
const { createRoot } = await import("react-dom/client");

const chat: WritingMode = { ...defaultMode(), id: "m1", name: "Chat", apps: ["slack"], rewrite: true };
const status = (enabled: boolean) => ({ settings: { rewrite: { enabled }, terms: [] } }) as unknown as DictationStatus;

async function mount(mode: WritingMode, { writer = true, onChange = () => {} }: { writer?: boolean; onChange?(m: WritingMode): void } = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
  for (const k of Object.getOwnPropertyNames(window)) if (/^[A-Z]/.test(k) && !(k in globalThis)) (globalThis as Record<string, unknown>)[k] = (window as unknown as Record<string, unknown>)[k];
  const props = { s: status(writer), mode, others: [], onBack() {}, onChange, onApps() {}, onSites() {}, onDelete() {} };
  await act(async () => createRoot(document.getElementById("root")!).render(<ModeDetail {...props} />));
  return document;
}

describe("mode detail rewrite style", () => {
  it("shows the mode's template by name and lists all eight with their one-line description", async () => {
    const document = await mount({ ...chat, template: "notes" });
    expect(document.querySelector('[aria-label="Rewrite style"]')?.textContent).toBe("Notes");
    const options = [...document.querySelectorAll('[aria-label="Rewrite style options"] li')].map((li) => li.textContent);
    expect(options).toHaveLength(8);
    expect(options[0]).toBe("Tidy: Punctuation, capitals, no fillers. For most apps.");
    expect(options[5]).toBe(`Notes: ${TEMPLATES.notes.line}`);
  });

  it("saves the chosen template on the mode and keeps its other fields", async () => {
    const saved: WritingMode[] = [];
    const document = await mount(chat, { onChange: (m) => saved.push(m) });
    expect(document.querySelector('[aria-label="Rewrite style"]')?.textContent).toBe("Tidy");
    const email = [...document.querySelectorAll('[aria-label="Rewrite style options"] li')].find((li) => li.textContent?.startsWith("Email:"));
    await act(async () => (email as HTMLElement).click());
    expect(saved).toEqual([{ ...chat, template: "email" }]);
  });

  it("is switched off while the mode does not rewrite or the writer is not set up", async () => {
    const off = await mount({ ...chat, rewrite: false });
    expect(off.querySelector('[aria-label="Rewrite style"]')?.hasAttribute("disabled")).toBe(true);
    expect(off.body.textContent).toContain("Turn on the rewrite pass for this mode first.");
    const noWriter = await mount(chat, { writer: false });
    expect(noWriter.querySelector('[aria-label="Rewrite style"]')?.hasAttribute("disabled")).toBe(true);
    const on = await mount(chat);
    expect(on.querySelector('[aria-label="Rewrite style"]')?.hasAttribute("disabled")).toBe(false);
    expect(on.body.textContent).not.toContain("Turn on the rewrite pass for this mode first.");
  });
});
