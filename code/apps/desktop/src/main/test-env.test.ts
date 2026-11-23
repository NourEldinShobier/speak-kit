import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const app = vi.hoisted(() => ({ isPackaged: false }));
vi.mock("electron", () => ({ app }));

import { testEnv } from "./test-env";

afterEach(() => {
  vi.unstubAllEnvs();
  app.isPackaged = false;
});

describe("testEnv updateUrl", () => {
  it("is honoured by a source checkout", () => {
    vi.stubEnv("SPEAKKIT_UPDATE_URL", "http://127.0.0.1:9/");
    expect(testEnv().updateUrl).toBe("http://127.0.0.1:9/");
  });

  it("is ignored by a packaged build that runs on the user's own data", () => {
    app.isPackaged = true;
    vi.stubEnv("SPEAKKIT_UPDATE_URL", "http://127.0.0.1:9/");
    vi.stubEnv("SPEAKKIT_USER_DATA", "");
    expect(testEnv().updateUrl).toBeUndefined();
  });

  it("is honoured by a packaged build in an isolated data folder (the update end-to-end run)", () => {
    app.isPackaged = true;
    vi.stubEnv("SPEAKKIT_UPDATE_URL", "http://127.0.0.1:9/");
    vi.stubEnv("SPEAKKIT_USER_DATA", "C:/tmp/isolated");
    expect(testEnv().updateUrl).toBe("http://127.0.0.1:9/");
  });
});

describe("testEnv openaiBaseUrl", () => {
  it("is honoured by a source checkout in test mode", () => {
    vi.stubEnv("SPEAKKIT_TEST", "1");
    vi.stubEnv("SPEAKKIT_OPENAI_BASE_URL", "http://127.0.0.1:9");
    expect(testEnv().openaiBaseUrl).toBe("http://127.0.0.1:9");
  });

  it("is ignored without test mode", () => {
    vi.stubEnv("SPEAKKIT_TEST", "");
    vi.stubEnv("SPEAKKIT_OPENAI_BASE_URL", "http://127.0.0.1:9");
    expect(testEnv().openaiBaseUrl).toBeUndefined();
  });

  it("is ignored by a packaged build, even in test mode", () => {
    app.isPackaged = true;
    vi.stubEnv("SPEAKKIT_TEST", "1");
    vi.stubEnv("SPEAKKIT_OPENAI_BASE_URL", "http://127.0.0.1:9");
    expect(testEnv().openaiBaseUrl).toBeUndefined();
  });
});
