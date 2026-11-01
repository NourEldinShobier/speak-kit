import type { PlayerState } from "@speakkit/protocol";
import type { HealthResult } from "../../shared/client";
import { engineBadge } from "./errors";

export type PopupView =
  | "install" | "offline" | "token" | "version" | "unreadable" | "pdf" | "fileurl" | "engine-missing"
  | "loading-model" | "preparing" | "playing" | "paused" | "finished" | "idle" | "selection";

export interface PopupInputs {
  hasToken: boolean;
  health: HealthResult | null;
  player: PlayerState | null;
  tabUrl?: string;
  /** "Allow access to file URLs" is on */
  fileAccess: boolean;
  selection: string;
}

/** Pages extensions cannot script. */
export function isUnreadableUrl(url?: string): boolean {
  if (!url) return false;
  if (/^(chrome|edge|brave|about|chrome-extension|chrome-search|devtools|view-source):/i.test(url)) return true;
  try {
    const u = new URL(url);
    if (u.hostname === "chromewebstore.google.com") return true;
    if (u.hostname === "chrome.google.com" && u.pathname.startsWith("/webstore")) return true;
    if (u.hostname === "microsoftedge.microsoft.com" && u.pathname.startsWith("/addons")) return true;
  } catch { /* not a URL */ }
  return false;
}

/** Chrome's PDF viewer is an extension frame: no content script or script injection reaches it. Known limit: a PDF served without a .pdf path is not recognised. */
export function isPdfUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Chrome hides the URL of a file:// tab from an extension that has no access to it, and executeScript fails with an error
 * that names the URL. Returns the file URL when the error is that one, "restricted" for chrome:// style pages.
 */
export function classifyProbeError(message: string): { kind: "file"; url: string } | { kind: "restricted" } | undefined {
  const file = /(file:\/\/[^\s"]*)/i.exec(message);
  if (file) return { kind: "file", url: file[1]! };
  if (/chrome:\/\/|chrome-extension:\/\/|edge:\/\/|webstore|cannot be scripted|extensions gallery/i.test(message)) return { kind: "restricted" };
  return undefined;
}

/**
 * One state function for the whole popup. Priority: connection problems (offline, token, version), active playback, engine
 * start-up, page problems (PDF, restricted page, file access), then idle / selection. The engine state "unloaded" is a normal resting state
 * (Wakes on play): it never produces an error view, and while a play request waits for it the popup shows loading-model.
 */
export function deriveView(i: PopupInputs): PopupView {
  const h = i.health;
  const p = i.player;
  const code = p?.status === "error" ? p.error?.code : undefined;

  if (!i.hasToken) return h && h.ok ? "token" : "install";
  if (h && !h.ok) return h.error === "token-rejected" ? "token" : h.error === "version-mismatch" ? "version" : "offline";
  if (code === "app-not-running") return "offline";
  if (code === "token-rejected") return "token";
  if (code === "version-mismatch") return "version";

  const engine = h && h.ok ? h.health.engine.state : "ready";
  const playing = p && (p.status === "preparing" || p.status === "playing" || p.status === "paused" || p.status === "finished");
  if (engine === "loading" || engine === "downloading" || (engine === "unloaded" && p?.status === "preparing")) {
    if (!playing || p?.status === "preparing") return "loading-model";
  }
  if (playing) return p.status as "preparing" | "playing" | "paused" | "finished";
  if (engine === "missing" || engine === "error" || code === "engine-not-ready") return "engine-missing";

  if (isPdfUrl(i.tabUrl)) return "pdf";
  if (code === "page-unreadable" || isUnreadableUrl(i.tabUrl)) return "unreadable";
  if (code === "file-access" || (i.tabUrl?.startsWith("file:") && !i.fileAccess)) return "fileurl";
  return i.selection ? "selection" : "idle";
}

export type Tone = "ok" | "warn" | "err" | "neutral";
export function headerBadge(view: PopupView, engine?: Parameters<typeof engineBadge>[0]): { tone: Tone; label: string } {
  switch (view) {
    case "install": return { tone: "neutral", label: "Not set up" };
    case "offline": return { tone: "err", label: "App offline" };
    case "token": return { tone: "warn", label: "Not paired" };
    case "version": return { tone: "warn", label: "Update needed" };
    case "loading-model": return { tone: "warn", label: engine === "unloaded" ? "Waking up" : "Loading model" };
    case "engine-missing": return { tone: "warn", label: "No voice engine" };
    default: return engineBadge(engine);
  }
}
