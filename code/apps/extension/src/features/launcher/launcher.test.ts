import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Shell, UiHandlers, UiModel } from "../../shared/ui-types";
import { installDom } from "../../testing/dom";
import { Launcher } from "./launcher";

const settingsLauncher = { enabled: true, side: "right", idle: "peek", openOn: "click", closeDelayMs: 300, widerWhileReading: true, y: 0.5 } as const;
const model = (over: Partial<UiModel> = {}): UiModel => ({
  status: "idle",
  elapsedMs: 0,
  totalMs: 0,
  speed: 1.2,
  voice: "af_heart",
  voiceName: "Heart",
  estimate: () => 90_000,
  dark: false,
  engineAsleep: false,
  showDock: true,
  alwaysDock: false,
  launcher: { ...settingsLauncher },
  showBubble: true,
  showGutter: true,
  readerOpen: false,
  dismissed: false,
  ...over,
});

let calls: string[];
let host: HTMLElement;
let root: HTMLElement;
let launcher: Launcher;

const handlers = () =>
  new Proxy({} as UiHandlers, {
    get:
      (_, k) =>
      (...a: unknown[]) =>
        calls.push([String(k), ...a.map((x) => (x instanceof Element ? `#${x.id}` : String(x)))].join(" ")),
  });

const setup = (m = model()) => {
  host = document.createElement("div");
  root = document.createElement("div");
  host.append(root);
  document.body.append(host);
  const shell: Shell = {
    host,
    root,
    width: 1280,
    height: 720,
    popover: null,
    togglePopover: () => {},
    closePopover: () => {},
    placeHostAfter: (n) => calls.push(`placeHostAfter ${n ? (n as Element).id : "end"}`),
  };
  launcher = new Launcher({ shell, hd: handlers(), model: m, dockEl: () => null });
  launcher.render(m);
  return m;
};
const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

beforeEach(() => {
  installDom();
  Object.assign(globalThis, { innerHeight: 720, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  calls = [];
});

describe("edge tab and pill", () => {
  test("an idle launcher rests as a tab on the saved side; the pill opens on click and Listen reads the page", () => {
    setup();
    expect($("[data-sk=launcher-tab]")!.className).toBe("sk-tab");
    expect($("[data-sk=launcher-tab]")!.style.top).toBe("360px");
    expect($("[data-sk=launcher-pill]")).toBeNull();
    click($("[data-sk=launcher-tab]"));
    expect($("[data-sk=launcher-tab]")).toBeNull();
    expect($("[data-sk=launcher-play]")!.getAttribute("aria-label")).toBe("Listen to this page");
    click($("[data-sk=launcher-play]"));
    expect(calls).toEqual(["listen"]);
  });

  test("left side mirrors the tab", () => {
    setup(model({ launcher: { ...settingsLauncher, side: "left" } }));
    expect($("[data-sk=launcher-tab]")!.className).toBe("sk-tab sk-left");
  });

  test("an idle tab is a focusable button with a name", () => {
    setup();
    const tab = $("[data-sk=launcher-tab]")!;
    expect([tab.getAttribute("role"), tab.getAttribute("tabindex"), tab.getAttribute("aria-label")]).toEqual(["button", "0", "Open Speak Kit controls"]);
  });

  test("while reading the tab is only a progress rail, centred on the viewport height, and the pill shows time left, speed and Stop", () => {
    const reading = model({ status: "playing", elapsedMs: 30_000, totalMs: 120_000, speed: 1.5 });
    setup(reading);
    const tab = $("[data-sk=launcher-tab]")!;
    expect(tab.className).toBe("sk-tab is-reading");
    expect(tab.querySelector("button")).toBeNull();
    expect(tab.style.top).toBe("312px");
    expect($(".sk-rail i")!.style.height).toBe("25%");
    expect([tab.getAttribute("role"), tab.getAttribute("tabindex"), tab.getAttribute("aria-label")]).toEqual(["button", "0", "Open reading controls"]);
    click(tab);
    expect($("[data-sk=launcher-pill]")!.getAttribute("data-state")).toBe("playing");
    expect($(".sk-time")!.textContent).toBe("1:30");
    expect($("[data-sk=launcher-speed]")!.textContent).toBe("1.5x");
    expect($(".sk-vrail i")!.style.height).toBe("25%");
    click($("[data-sk=launcher-stop]"));
    click($("[data-sk=launcher-fwd]"));
    expect(calls).toEqual(["stop", "skip 10000"]);
  });

  test("the reading rail ignores the saved height and Enter on it opens the pill with Pause focused", () => {
    setup(model({ status: "paused", elapsedMs: 10_000, totalMs: 100_000, launcher: { ...settingsLauncher, y: 0.9 } }));
    const tab = $("[data-sk=launcher-tab]")!;
    expect(tab.style.top).toBe("312px");
    tab.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true }), { key: "Enter" }));
    expect($("[data-sk=launcher-tab]")).toBeNull();
    expect($("[data-sk=launcher-play]")!.getAttribute("aria-label")).toBe("Resume");
  });

  test("with the widening off, reading keeps the plain tab at its saved height", () => {
    setup(model({ status: "playing", totalMs: 100_000, launcher: { ...settingsLauncher, widerWhileReading: false } }));
    expect([$("[data-sk=launcher-tab]")!.className, $("[data-sk=launcher-tab]")!.style.top, $(".sk-rail")]).toEqual(["sk-tab", "360px", null]);
  });

  test("progress and speed update in place on a new model", () => {
    setup(model({ status: "playing", totalMs: 100_000, elapsedMs: 0 }));
    click($("[data-sk=launcher-tab]"));
    launcher.render(model({ status: "playing", totalMs: 100_000, elapsedMs: 50_000, speed: 2 }));
    expect([$(".sk-time")!.textContent, $("[data-sk=launcher-speed]")!.getAttribute("aria-label"), $(".sk-vrail i")!.style.height]).toEqual(["0:50", "Speed 2x", "50%"]);
  });

  test("a launcher turned off by a site rule leaves nothing in the page", () => {
    setup(model({ launcher: null }));
    expect($("[data-sk=launcher-tab]")).toBeNull();
  });
});

describe("selection bubble", () => {
  const rect = { left: 400, top: 300, right: 500, bottom: 320, width: 100, height: 20 } as DOMRect;

  test("Listen reads the selection and closes the bubble; copy reports Copied", () => {
    setup();
    launcher.showBubble(rect);
    expect(launcher.bubbleVisible).toBe(true);
    expect(calls).toEqual(["warm selection"]);
    click($("[data-sk=bubble-copy]"));
    expect(calls).toEqual(["warm selection", "copySelection"]);
    expect($("[data-sk=toast]")!.textContent).toContain("Copied");
    expect(launcher.bubbleVisible).toBe(false);
    launcher.showBubble(rect);
    click($("[data-sk=bubble-listen]"));
    expect(calls.at(-1)).toBe("readSelection");
  });

  test("is not shown when the model turns it off", () => {
    setup(model({ showBubble: false }));
    launcher.showBubble(rect);
    expect(launcher.bubbleVisible).toBe(false);
  });
});

describe("paragraph button", () => {
  const paragraph = () => {
    const p = document.createElement("p");
    p.id = "para";
    document.body.append(p);
    p.getBoundingClientRect = () => ({ left: 100, top: 100, right: 700, bottom: 160, width: 600, height: 60, x: 100, y: 100, toJSON() {} });
    return p;
  };

  test("shows Read from here next to the paragraph and reads from it on click", () => {
    setup();
    const p = paragraph();
    launcher.showGutter(p);
    const btn = $("[data-sk=gutter-play]")!;
    expect([btn.getAttribute("aria-label"), btn.style.left, btn.style.top]).toEqual(["Read from here", "52px", "102px"]);
    click(btn);
    expect(calls).toContain("readFromHere #para");
    expect($("[data-sk=gutter-play]")).toBeNull();
  });

  test("the paragraph being read says so and ignores clicks", () => {
    const p = paragraph();
    setup(model({ status: "playing", readingBlock: p }));
    launcher.showGutter(p);
    const btn = $("[data-sk=gutter-play]")!;
    expect([btn.getAttribute("aria-label"), btn.getAttribute("aria-disabled")]).toEqual(["Reading this paragraph", "true"]);
    click(btn);
    expect(calls.filter((c) => c.startsWith("readFromHere"))).toEqual([]);
  });

  test("reached by keyboard, the host moves next to the focused element and goes back to the end when the button goes", () => {
    setup();
    const p = paragraph();
    const link = document.createElement("a");
    link.id = "lk";
    p.append(link);
    launcher.showGutter(p, link);
    expect(calls).toEqual(["placeHostAfter lk"]);
    launcher.showGutter(null);
    expect(calls).toEqual(["placeHostAfter lk", "placeHostAfter end"]);
  });

  test("Escape dismisses it once, and it does not come back for the same paragraph until another is entered", () => {
    setup();
    const p = paragraph();
    const q = paragraph();
    launcher.showGutter(p);
    expect(launcher.dismissGutter()).toBe(true);
    expect($("[data-sk=gutter-play]")).toBeNull();
    expect(launcher.dismissGutter()).toBe(false);
    launcher.showGutter(p);
    expect($("[data-sk=gutter-play]")).toBeNull();
    launcher.showGutter(q);
    expect($("[data-sk=gutter-play]")).not.toBeNull();
  });

  test("is not shown when the model turns it off", () => {
    setup(model({ showGutter: false }));
    launcher.showGutter(paragraph());
    expect($("[data-sk=gutter-play]")).toBeNull();
  });
});

describe("toast and back pill", () => {
  test("a toast with an action runs it and goes away", () => {
    setup();
    const run = vi.fn();
    launcher.toast("Added to the queue", "ok", { label: "View queue", run });
    expect($("[data-sk=toast]")!.getAttribute("role")).toBe("status");
    click($("[data-sk=toast-action]"));
    expect(run).toHaveBeenCalledOnce();
    expect($("[data-sk=toast]")).toBeNull();
  });

  test("an error toast is an alert; Back to current appears, flips below and calls the handler", () => {
    setup();
    launcher.toast("Could not read", "err");
    expect($("[data-sk=toast]")!.getAttribute("role")).toBe("alert");
    launcher.showBack(true, true);
    expect($("[data-sk=back-to-current]")!.classList.contains("is-down")).toBe(true);
    click($("[data-sk=back-to-current]"));
    expect(calls).toEqual(["backToCurrent"]);
    launcher.showBack(false);
    expect($("[data-sk=back-to-current]")).toBeNull();
  });
});
