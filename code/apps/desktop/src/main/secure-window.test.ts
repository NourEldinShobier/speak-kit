import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const made = vi.hoisted(() => ({
  options: undefined as Record<string, unknown> | undefined,
  request: undefined as ((...a: unknown[]) => void) | undefined,
  check: undefined as ((...a: unknown[]) => boolean) | undefined,
  nextId: 1,
  /** Every window shares this session, like the default session of the app. */
  session: {} as Record<string, unknown>,
  lastContents: undefined as { id: number } | undefined,
}));

vi.mock("electron", () => ({
  BrowserWindow: class {
    webContents = {
      id: made.nextId++,
      session: made.session,
      setWindowOpenHandler: () => {},
      on: () => {},
      once: () => {},
    };
    constructor(options: Record<string, unknown>) {
      made.options = options;
      made.lastContents = this.webContents;
    }
    setMenuBarVisibility() {}
  },
}));

import { createSecureWindow } from "./secure-window";

let plain: { id: number };

beforeEach(() => {
  made.options = undefined;
  made.session = {};
  made.session.setPermissionRequestHandler = (h: (...a: unknown[]) => void) => (made.request = h);
  made.session.setPermissionCheckHandler = (h: (...a: unknown[]) => boolean) => (made.check = h);
  made.request = made.check = undefined;
  createSecureWindow({}, () => {});
  plain = made.lastContents!;
});

describe("createSecureWindow", () => {
  it("isolates the page: sandbox, context isolation, web security, no spellcheck", () => {
    expect(made.options?.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false });
  });

  it.each(["media", "geolocation", "notifications", "clipboard-read", "midi"])("denies a %s permission request", (permission) => {
    const answers: boolean[] = [];
    made.request?.(plain, permission, (granted: boolean) => answers.push(granted));
    expect(answers).toEqual([false]);
  });

  it("answers every permission check with no, the microphone included", () => {
    expect(made.check?.(plain, "media", "file://", { mediaType: "audio", requestingUrl: "file:///app/index.html" })).toBe(false);
  });
});
