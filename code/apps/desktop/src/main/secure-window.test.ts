import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const made = vi.hoisted(() => ({
  options: undefined as Record<string, unknown> | undefined,
  request: undefined as ((...a: unknown[]) => void) | undefined,
  check: undefined as ((...a: unknown[]) => boolean) | undefined,
}));

vi.mock("electron", () => ({
  BrowserWindow: class {
    webContents = {
      session: {
        setPermissionRequestHandler: (h: (...a: unknown[]) => void) => (made.request = h),
        setPermissionCheckHandler: (h: (...a: unknown[]) => boolean) => (made.check = h),
      },
      setWindowOpenHandler: () => {},
      on: () => {},
    };
    constructor(options: Record<string, unknown>) {
      made.options = options;
    }
    setMenuBarVisibility() {}
  },
}));

import { createSecureWindow } from "./secure-window";

beforeEach(() => {
  made.options = made.request = made.check = undefined;
  createSecureWindow({}, () => {});
});

describe("createSecureWindow", () => {
  it("isolates the page: sandbox, context isolation, web security, no spellcheck", () => {
    expect(made.options?.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false });
  });

  it.each(["media", "geolocation", "notifications", "clipboard-read", "midi"])("denies a %s permission request", (permission) => {
    const answers: boolean[] = [];
    made.request?.({}, permission, (granted: boolean) => answers.push(granted));
    expect(answers).toEqual([false]);
  });

  it("answers every permission check with no", () => {
    expect(made.check?.()).toBe(false);
  });

  it("lets the main window use the microphone for audio from its own page, and nothing else", () => {
    createSecureWindow({}, () => {}, { microphone: true });
    const answer = (permission: string, mediaTypes: string[], requestingUrl = "file:///app/index.html") => {
      const answers: boolean[] = [];
      made.request?.({}, permission, (granted: boolean) => answers.push(granted), { mediaTypes, requestingUrl });
      return answers[0];
    };
    expect([answer("media", ["audio"]), answer("media", ["video"]), answer("media", ["audio"], "https://example.com/"), answer("geolocation", [])]).toEqual([true, false, false, false]);
    expect(made.check?.({}, "media", "file://", { mediaType: "audio", requestingUrl: "file:///app/index.html" })).toBe(true);
    expect(made.check?.({}, "media", "file://", { mediaType: "video", requestingUrl: "file:///app/index.html" })).toBe(false);
  });
});
