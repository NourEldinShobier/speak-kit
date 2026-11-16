import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { IDLE_READER, type ReaderState } from "../shared/reader";
import { DEFAULT_SHORTCUTS } from "../shared/shortcuts";
import type { TrayContext } from "../shared/tray";
import { UPDATE_UNSUPPORTED } from "../shared/updates";

const mocks = vi.hoisted(() => {
  const state = { trays: [] as FakeTray[], fail: false };
  class FakeTray {
    image: unknown;
    tip = "";
    menu: { items: Record<string, unknown>[] } | null = null;
    handlers = new Map<string, () => void>();
    destroyed = false;
    popped: { items: Record<string, unknown>[] }[] = [];
    constructor(image: unknown) {
      if (state.fail) throw new Error("no notification area");
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
    popUpContextMenu(m: { items: Record<string, unknown>[] }) {
      this.popped.push(m);
    }
    getBounds() {
      return { x: 1800, y: 1040, width: 24, height: 40 };
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return { state, FakeTray };
});

vi.mock("electron", () => ({
  Tray: mocks.FakeTray,
  Menu: {
    buildFromTemplate: (template: Record<string, unknown>[]) => ({
      items: template.map((t) => ({ ...t, type: t.type ?? "normal", enabled: t.enabled ?? true })),
    }),
  },
}));
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
  const run = Object.fromEntries(
    ["open", "pause", "resume", "stop", "wake", "restart-engine", "dnd", "settings", "check-updates", "restart-update", "quit"].map((a) => [a, vi.fn()]),
  ) as never as Record<string, ReturnType<typeof vi.fn>>;
  const tray = createTray(() => context, run as never);
  return { tray, run, fake: mocks.state.trays.at(-1)!, set: (c: TrayContext) => (context = c) };
}
const labels = (t: ReturnType<typeof setup>) => t.fake.menu!.items.filter((i) => i.type !== "separator").map((i) => i.label);

beforeEach(() => {
  mocks.state.trays.length = 0;
  mocks.state.fail = false;
});

describe("tray wiring", () => {
  it("starts with the icon, tooltip and menu of the current state", () => {
    const t = setup();
    expect(t.fake.image).toBe("icon:normal");
    expect(t.fake.tip).toMatch(/^Speak Kit - Ready/);
    expect(t.tray.summary()).toBe(`normal|${t.fake.tip}`);
    expect(t.tray.summary().startsWith("normal|")).toBe(true);
    expect(labels(t)).toEqual(["Open Speak Kit", "Do not disturb", "Settings", "Check for updates", "Quit Speak Kit"]);
  });

  it("turns menu rows into native items: accelerators that do not register, a checkbox for Do not disturb, disabled rows", () => {
    const t = setup(base({ doNotDisturb: true, health: health("loading") }));
    expect(t.fake.menu!.items.find((i) => i.label === "Do not disturb")).toMatchObject({ type: "checkbox", checked: true });
  });

  it("on macOS the menu opens on right click only, so the plain click can show the window", () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      const t = setup();
      expect(t.fake.menu).toBeNull();
      t.fake.handlers.get("right-click")!();
      expect(t.fake.popped).toHaveLength(1);
      expect(t.fake.popped[0]!.items[0]).toMatchObject({ label: "Open Speak Kit" });
    } finally {
      Object.defineProperty(process, "platform", { value: original });
    }
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
});

describe("tray left click", () => {
  it("shows the main window, on every platform, without opening the menu", () => {
    const t = setup();
    t.fake.handlers.get("click")!();
    expect(t.run.open).toHaveBeenCalledTimes(1);
    expect(t.fake.popped).toHaveLength(0);
  });

  it("dispose removes the icon", () => {
    const t = setup();
    t.tray.dispose();
    expect(t.fake.destroyed).toBe(true);
  });
});

describe("tray that cannot be created", () => {
  it("does not throw, reports the failure and keeps refreshing without an icon", () => {
    mocks.state.fail = true;
    const tray = createTray(() => base(), {} as never);
    expect(tray.failed()).toBe(true);
    expect(() => tray.refresh()).not.toThrow();
    expect(tray.summary()).toBe("");
    expect(mocks.state.trays).toHaveLength(0);
  });

  it("tries again when the icon is switched on, and stops reporting once it exists", () => {
    mocks.state.fail = true;
    const tray = createTray(() => base(), {} as never);
    mocks.state.fail = false;
    tray.setVisible(true);
    expect(tray.failed()).toBe(false);
    expect(mocks.state.trays).toHaveLength(1);
  });

  it("is not a failure when the person hid the icon", () => {
    mocks.state.fail = true;
    const tray = createTray(() => base(), {} as never);
    tray.setVisible(false);
    expect(tray.failed()).toBe(false);
  });
});
