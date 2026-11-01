import { describe, expect, it } from "vite-plus/test";
import type { PlayerState } from "@speakkit/protocol";
import type { HealthResult } from "../../shared/client";
import { deriveView, headerBadge, isPdfUrl, type PopupInputs } from "./popup-view";

const health = (state: "ready" | "unloaded" | "missing" = "ready"): HealthResult => ({
  ok: true,
  ms: 4,
  health: { app: "speakkit", version: "1.0.0", apiVersion: 1, engine: { id: "kokoro", state } },
});
const idle: PlayerState = { status: "idle", sentenceIndex: 0, sentenceCount: 0, elapsedMs: 0, totalMs: 0, speed: 1, voice: "af_heart", queueLength: 0 };
const input = (over: Partial<PopupInputs> = {}): PopupInputs => ({
  hasToken: true, health: health(), player: idle, tabUrl: "https://example.com/post", fileAccess: true, selection: "", ...over,
});

describe("deriveView", () => {
  it("shows the version state when the app reports another protocol version", () => {
    expect(deriveView(input({ health: { ok: false, error: "version-mismatch" } }))).toBe("version");
  });

  it("shows the version state when playback failed with a version error", () => {
    expect(deriveView(input({ player: { ...idle, status: "error", error: { code: "version-mismatch", message: "x" } } }))).toBe("version");
  });

  it("keeps offline for an unreachable app and token for a rejected token", () => {
    expect(deriveView(input({ health: { ok: false, error: "app-not-running" } }))).toBe("offline");
    expect(deriveView(input({ health: { ok: false, error: "token-rejected" } }))).toBe("token");
  });

  it("shows the PDF state for a PDF tab, also with a query string", () => {
    expect(deriveView(input({ tabUrl: "https://example.com/files/paper.pdf" }))).toBe("pdf");
    expect(deriveView(input({ tabUrl: "https://example.com/files/paper.PDF?download=1#page=2" }))).toBe("pdf");
  });

  it("shows the restricted-page state for chrome:// and plain pages as idle or selection", () => {
    expect(deriveView(input({ tabUrl: "chrome://extensions" }))).toBe("unreadable");
    expect(deriveView(input())).toBe("idle");
    expect(deriveView(input({ selection: "a sentence" }))).toBe("selection");
  });

  it("asks for file access on file:// pages when it is off", () => {
    expect(deriveView(input({ tabUrl: "file:///C:/notes.html", fileAccess: false }))).toBe("fileurl");
  });

  it("a sleeping engine is idle, not an error", () => {
    expect(deriveView(input({ health: health("unloaded") }))).toBe("idle");
  });
});

describe("isPdfUrl", () => {
  it("matches the path only", () => {
    expect(isPdfUrl("https://a.test/x.pdf")).toBe(true);
    expect(isPdfUrl("https://a.test/x.pdf.html")).toBe(false);
    expect(isPdfUrl("https://a.test/read?file=x.pdf")).toBe(false);
    expect(isPdfUrl(undefined)).toBe(false);
    expect(isPdfUrl("not a url")).toBe(false);
  });
});

describe("headerBadge", () => {
  it("says what the user must do for a version mismatch", () => {
    expect(headerBadge("version")).toEqual({ tone: "warn", label: "Update needed" });
  });
});
