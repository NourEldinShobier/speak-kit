import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { IDLE_READER, type ReaderState } from "../shared/reader";
import { DEFAULT_SHORTCUTS } from "../shared/shortcuts";
import type { TrayContext } from "../shared/tray";
import { UPDATE_UNSUPPORTED } from "../shared/updates";
import type { Ctx } from "./context";

const mocks = vi.hoisted(() => {
  const state = { trays: [] as FakeTray[], panels: [] as FakePanel[] };
  class FakeTray {
    image: unknown;
    tip = "";
    menu: { items: Record<string, unknown>[] } | null = null;
    handlers = new Map<string, () => void>();
    destroyed = false;
    constructor(image: unknown) {
      this.image = image;
      state.trays.push(this);
    }
    on(e: string, f: () => void) {
      this.handlers.set(e, f);
    }
    setImage(i: unknown) {
      this.image = i;
    }
    setToolTip(t: string) {
      this.tip = t;
    }
    setContextMenu(m: { items: Record<string, unknown>[] }) {
      this.menu = m;
    }
    getBounds() {
      return { x: 1800, y: 1040, width: 24, height: 40 };
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class FakePanel {
    visible = false;
    closed = 0;
    blur: (() => void) | undefined;
    window = { isVisible: () => this.visible };
    constructor(
      public page: string,
      public options: unknown,
    ) {
      state.panels.push(this);
    }
    open() {
      this.visible = true;
      return { once: (_: string, f: () => void) => (this.blur = f) };
    }
    close() {
      this.visible = false;
      this.closed++;
    }
    sendState = vi.fn();
    owns = (c: unknown) => c === "panel-contents";
  }
  return { state, FakeTray, FakePanel };
});

vi.mock("electron", () => ({
  Tray: mocks.FakeTray,
  Menu: {
    buildFromTemplate: (template: Record<string, unknown>[]) => ({
      items: template.map((t) => ({ ...t, type: t.type ?? "normal", enabled: t.enabled ?? true })),
    }),
  },
}));
vi.mock("./windows", () => ({ FloatWindow: mocks.FakePanel, aboveTray: (b: unknown) => ({ above: b }) }));
vi.mock("./icon", () => ({ trayIcon: (state: string) => `icon:${state}` }));

import { createTray } from "./tray";

const health = (state: string) => ({ app: "speakkit", version: "1", engine: { state } }) as never;
const base = (over: Partial<TrayContext> = {}): TrayContext => ({
  health: health("ready"),
  serverError: null,
  reader: IDLE_READER,
  update: UPDATE_UNSUPPORTED,
  exportsRunning: 0,
  doNotDisturb: false,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  ...over,
});
const reading = (status: ReaderState["status"]): ReaderState => ({ ...IDLE_READER, status, title: "Chapter 1", index: 2, total: 10 }) as ReaderState;

function setup(initial: TrayContext = base()) {
  let context = initial;
  const sinks = new Set<(s: unknown) => void>();
  const run = Object.fromEntries(
    ["read-clipboard", "open", "pause", "resume", "stop", "wake", "restart-engine", "dnd", "settings", "check-updates", "restart-update", "quit"].map((a) => [a, vi.fn()]),
  ) as never as Record<string, ReturnType<typeof vi.fn>>;
  const tray = createTray({ state: { id: "state" }, sinks } as unknown as Ctx, () => context, run as never);
  return { tray, sinks, run, fake: mocks.state.trays.at(-1)!, panel: mocks.state.panels.at(-1)!, set: (c: TrayContext) => (context = c) };
}
const labels = (t: ReturnType<typeof setup>) => t.fake.menu!.items.filter((i) => i.type !== "separator").map((i) => i.label);

beforeEach(() => {
  mocks.state.trays.length = 0;
  mocks.state.panels.length = 0;
});

describe("tray wiring", () => {
  it("starts with the icon, tooltip and menu of the current state", () => {
    const t = setup();
    expect(t.fake.image).toBe("icon:normal");
    expect(t.fake.tip).toMatch(/^Speak Kit - Ready/);
    expect(t.tray.summary()).toBe(`normal|${t.fake.tip}`);
    expect(t.tray.summary().startsWith("normal|")).toBe(true);
    expect(labels(t)).toEqual(["Read clipboard", "Open Speak Kit", "Do not disturb", "Settings", "Check for updates", "Quit Speak Kit"]);
  });

  it("turns menu rows into native items: accelerators that do not register, a checkbox for Do not disturb, disabled rows", () => {
    const t = setup(base({ doNotDisturb: true, health: health("loading") }));
    const [clipboard] = t.fake.menu!.items;
    expect(clipboard).toMatchObject({ label: "Read clipboard", enabled: false, accelerator: DEFAULT_SHORTCUTS["read-clipboard"].replace("Ctrl", "CommandOrControl"), registerAccelerator: false });
    expect(t.fake.menu!.items.find((i) => i.label === "Do not disturb")).toMatchObject({ type: "checkbox", checked: true });
  });

  it("clicking an item runs the handler of its action", () => {
    const t = setup();
    (t.fake.menu!.items.find((i) => i.label === "Settings")!.click as () => void)();
    (t.fake.menu!.items.find((i) => i.label === "Quit Speak Kit")!.click as () => void)();
    expect(t.run.settings).toHaveBeenCalledTimes(1);
    expect(t.run.quit).toHaveBeenCalledTimes(1);
    expect(t.run.open).not.toHaveBeenCalled();
  });

  it("refresh follows reading state: working icon with the position, Pause and Stop appear, Resume when paused", () => {
    const t = setup();
    t.set(base({ reader: reading("playing") }));
    t.tray.refresh();
    expect(t.fake.image).toBe("icon:working");
    expect(t.fake.tip).toBe("Speak Kit - Reading 3 of 10: Chapter 1");
    expect(labels(t)).toContain("Pause");
    t.set(base({ reader: reading("paused") }));
    t.tray.refresh();
    expect(t.fake.image).toBe("icon:paused");
    expect(labels(t)).toEqual(expect.arrayContaining(["Resume", "Stop"]));
    expect(labels(t)).not.toContain("Pause");
  });

  it("shows the update row that matches the update state", () => {
    const t = setup(base({ update: { kind: "ready", version: "0.3.0" } as never }));
    expect(t.fake.image).toBe("icon:attention");
    expect(labels(t)).toContain("Restart to update to 0.3.0");
  });

  it("rebuilds the native menu only when something it shows changed", () => {
    const t = setup();
    const first = t.fake.menu;
    t.tray.refresh();
    expect(t.fake.menu).toBe(first);
    t.set(base({ doNotDisturb: true }));
    t.tray.refresh();
    expect(t.fake.menu).not.toBe(first);
  });

  it("exposes the native items for tests", () => {
    const t = setup();
    expect(t.tray.items().map((i) => i.label)).toContain("Quit Speak Kit");
  });
});

describe("tray panel", () => {
  it("sends every published state to the panel", () => {
    const t = setup();
    [...t.sinks][0]!({ any: 1 });
    expect(t.panel.sendState).toHaveBeenCalledWith({ any: 1 });
  });

  it("left click opens the panel above the icon and closes it again; losing focus closes it", () => {
    const t = setup();
    t.fake.handlers.get("click")!();
    expect(t.panel.visible).toBe(true);
    t.fake.handlers.get("click")!();
    expect(t.panel.visible).toBe(false);
    t.fake.handlers.get("click")!();
    t.panel.blur!();
    expect(t.panel.visible).toBe(false);
  });

  it("opening the panel wakes the model so a read from it starts warm; closing it does not", () => {
    const t = setup();
    t.fake.handlers.get("click")!();
    expect(t.run.wake).toHaveBeenCalledTimes(1);
    t.fake.handlers.get("click")!();
    expect(t.run.wake).toHaveBeenCalledTimes(1);
  });

  it("owns only the panel's contents; dispose closes the panel and removes the icon", () => {
    const t = setup();
    expect(t.tray.owns("panel-contents" as never)).toBe(true);
    expect(t.tray.owns("other" as never)).toBe(false);
    t.tray.dispose();
    expect(t.panel.visible).toBe(false);
    expect(t.fake.destroyed).toBe(true);
  });
});
