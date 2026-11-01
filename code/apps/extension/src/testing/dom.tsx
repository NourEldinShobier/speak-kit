import { parseHTML } from "linkedom";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";

/** A DOM for component tests that need no layout: linkedom globals plus the few browser APIs Radix and React read. */
export function installDom(): void {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  const g = globalThis as Record<string, unknown>;
  Object.assign(g, {
    window,
    document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent ?? window.Event,
    KeyboardEvent: window.KeyboardEvent ?? window.Event,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  // Radix does `instanceof HTMLFormElement` and the like: every DOM class linkedom has, plus empty subclasses for the ones it lacks.
  for (const k of Object.getOwnPropertyNames(window)) if (/^[A-Z]/.test(k) && !(k in g)) g[k] = (window as unknown as Record<string, unknown>)[k];
  for (const k of ["HTMLFormElement", "HTMLInputElement", "HTMLButtonElement", "HTMLTextAreaElement", "HTMLSelectElement", "SVGElement"]) g[k] ??= class extends window.HTMLElement {};
  // linkedom reports no type for <input> without the attribute; React then does not treat it as a text field and never calls onChange.
  Object.defineProperty(window.HTMLInputElement.prototype, "type", {
    get() {
      return this.getAttribute("type") || "text";
    },
    configurable: true,
  });
  // React feature-detects the input event with `"oninput" in document`; without it onChange never fires.
  Object.assign(document, { oninput: null });
  Object.assign(window, { ResizeObserver: g.ResizeObserver, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
}

interface Mounted {
  root: HTMLElement;
  rerender(ui: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}

export async function mount(ui: ReactNode): Promise<Mounted> {
  const container = document.getElementById("root")!;
  // react-dom/client feature-detects the DOM when it is first loaded, so it is loaded only after installDom has run.
  const { createRoot } = await import("react-dom/client");
  const r: Root = createRoot(container);
  await act(async () => r.render(ui));
  return {
    root: container,
    rerender: (next) => act(async () => r.render(next)),
    unmount: () => act(async () => r.unmount()),
  };
}

export const click = (el: Element | null): Promise<void> => {
  if (!el) throw new Error("click: element not found");
  return act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

export const byLabel = (root: ParentNode, label: string) => root.querySelector(`[aria-label="${label}"]`);
export const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Sets a text field's value the way a user typing would: through the prototype setter, so React sees a change. */
export const typeInto = (el: Element | null, value: string): Promise<void> => {
  if (!el) throw new Error("typeInto: element not found");
  return act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
