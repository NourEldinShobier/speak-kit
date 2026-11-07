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

  it("answers every permission check with no", () => {
    expect(made.check?.(plain, "media", "file://", { mediaType: "audio", requestingUrl: "file:///app/index.html" })).toBe(false);
  });

  it("lets the main window use the microphone for audio from its own page, and nothing else", () => {
    createSecureWindow({}, () => {}, { microphone: true });
    const main = made.lastContents;
    const answer = (permission: string, mediaTypes: string[], requestingUrl = "file:///app/index.html") => {
      const answers: boolean[] = [];
      made.request?.(main, permission, (granted: boolean) => answers.push(granted), { mediaTypes, requestingUrl });
      return answers[0];
    };
    expect([answer("media", ["audio"]), answer("media", ["video"]), answer("media", ["audio"], "https://example.com/"), answer("geolocation", [])]).toEqual([true, false, false, false]);
    expect(made.check?.(main, "media", "file://", { mediaType: "audio", requestingUrl: "file:///app/index.html" })).toBe(true);
    expect(made.check?.(main, "media", "file://", { mediaType: "video", requestingUrl: "file:///app/index.html" })).toBe(false);
  });

  it("keeps the microphone for the main window when a mini window is created after it on the same session", () => {
    createSecureWindow({}, () => {}, { microphone: true });
    const main = made.lastContents;
    createSecureWindow({}, () => {});
    const mini = made.lastContents;
    const ask = (contents: unknown) => {
      const answers: boolean[] = [];
      made.request?.(contents, "media", (granted: boolean) => answers.push(granted), { mediaTypes: ["audio"], requestingUrl: "file:///app/index.html" });
      return answers[0];
    };
    expect([ask(main), ask(mini)]).toEqual([true, false]);
    expect([
      made.check?.(main, "media", "file://", { mediaType: "audio", requestingUrl: "file:///app/index.html" }),
      made.check?.(mini, "media", "file://", { mediaType: "audio", requestingUrl: "file:///app/index.html" }),
    ]).toEqual([true, false]);
  });
});
