import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const images = vi.hoisted(() => [] as { scaleFactor?: number | undefined; template: boolean; data: string }[]);
vi.mock("electron", () => ({
  nativeImage: {
    createFromBuffer: (b: Buffer, o?: { scaleFactor?: number }) => {
      const img = { scaleFactor: o?.scaleFactor, template: false, data: b.toString("base64"), setTemplateImage: (t: boolean) => void (img.template = t) };
      images.push(img);
      return img;
    },
  },
}));

const load = async (platform: NodeJS.Platform) => {
  vi.resetModules();
  images.length = 0;
  vi.stubGlobal("process", { ...process, platform });
  return (await import("./icon")).trayIcon;
};

describe("trayIcon", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("on macOS uses 2x menu-bar images, templates only for the plain states", async () => {
    const trayIcon = await load("darwin");
    for (const s of ["normal", "asleep", "working", "error", "paused", "attention"] as const) trayIcon(s);
    expect(images.map((i) => [i.scaleFactor, i.template])).toEqual([
      [2, true],
      [2, true],
      [2, false],
      [2, false],
      [2, false],
      [2, false],
    ]);
  });

  it("elsewhere uses the colour images at 1x", async () => {
    const trayIcon = await load("win32");
    trayIcon("normal");
    expect(images).toEqual([expect.objectContaining({ scaleFactor: undefined, template: false })]);
  });

  it("builds each state once", async () => {
    const trayIcon = await load("darwin");
    expect(trayIcon("normal")).toBe(trayIcon("normal"));
    expect(images).toHaveLength(1);
  });
});

describe("trayIcon dark taskbar variant", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("on Windows is a different image from the light one, built once each", async () => {
    const trayIcon = await load("win32");
    trayIcon("normal");
    trayIcon("normal", true);
    trayIcon("normal", true);
    trayIcon("normal");
    expect(images).toHaveLength(2);
    expect(images[0]!.data).not.toBe(images[1]!.data);
  });

  it("covers every state", async () => {
    const trayIcon = await load("win32");
    for (const s of ["normal", "asleep", "working", "error", "paused", "attention"] as const) trayIcon(s, true);
    expect(new Set(images.map((i) => i.data)).size).toBe(6);
  });
});
