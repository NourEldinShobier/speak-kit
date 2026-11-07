import type { PlayerState } from "@speakkit/protocol";
import type { HealthResult } from "../../shared/client";
import { engineBadge } from "./errors";

export type PopupView =
  | "install"
  | "offline"
  | "token"
  | "version"
  | "unreadable"
  | "pdf"
  | "fileurl"
  | "engine-missing"
  | "loading-model"
  | "preparing"
  | "playing"
  | "paused"
  | "finished"
  | "idle"
  | "selection";

export interface PopupInputs {
  hasToken: boolean;
  health: HealthResult | null;
  player: PlayerState | null;
  tabUrl?: string | undefined;
  /** "Allow access to file URLs" is on */
  fileAccess: boolean;
  selection: string;
  /** The Listen button was just pressed and the service worker has not reported yet (extraction takes ~150 ms). */
  starting?: boolean;
}

/** Pages extensions cannot script. */
function isUnreadableUrl(url?: string): boolean {
  if (!url) return false;
  if (/^(chrome|edge|brave|about|chrome-extension|chrome-search|devtools|view-source):/i.test(url)) return true;
  try {
    const u = new URL(url);
    if (u.hostname === "chromewebstore.google.com") return true;
    if (u.hostname === "chrome.google.com" && u.pathname.startsWith("/webstore")) return true;
    if (u.hostname === "microsoftedge.microsoft.com" && u.pathname.startsWith("/addons")) return true;
  } catch {
    /* not a URL */
  }
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

/** Connection failures, whether the health check or the player reported them. */
const CONNECTION_VIEW: Partial<Record<string, PopupView>> = { "app-not-running": "offline", "token-rejected": "token", "version-mismatch": "version" };

const LIVE = ["preparing", "playing", "paused", "finished"] as const;
type LiveStatus = (typeof LIVE)[number];
const liveStatus = (p: PlayerState | null): LiveStatus | undefined => LIVE.find((s) => s === p?.status);

function connectionView(i: PopupInputs, code: string | undefined): PopupView | undefined {
  const h = i.health;
  if (!i.hasToken) return h?.ok ? "token" : "install";
  if (h && !h.ok) return CONNECTION_VIEW[h.error] ?? "offline";
  // A playback error about the connection is old news once the health check, token included, passes.
  return code && !(h?.ok && (code === "app-not-running" || code === "token-rejected")) ? CONNECTION_VIEW[code] : undefined;
}

const isPreparing = (i: PopupInputs) => i.player?.status === "preparing" || (!!i.starting && (!i.player || i.player.status === "idle"));
const engineState = (i: PopupInputs) => (i.health?.ok ? i.health.health.engine.state : "ready");
const isWarming = (engine: string, preparing: boolean) => engine === "loading" || engine === "downloading" || (engine === "unloaded" && preparing);

function playbackView(i: PopupInputs, code: string | undefined): PopupView | undefined {
  const engine = engineState(i);
  const live = liveStatus(i.player);
  const preparing = isPreparing(i);
  if (isWarming(engine, preparing) && (!live || preparing)) return "loading-model";
  if (preparing) return "preparing";
  if (live) return live;
  return engine === "missing" || engine === "error" || code === "engine-not-ready" ? "engine-missing" : undefined;
}

function pageView(i: PopupInputs, code: string | undefined): PopupView {
  if (isPdfUrl(i.tabUrl)) return "pdf";
  if (code === "page-unreadable" || isUnreadableUrl(i.tabUrl)) return "unreadable";
  if (code === "file-access" || (i.tabUrl?.startsWith("file:") && !i.fileAccess)) return "fileurl";
  return i.selection ? "selection" : "idle";
}

/**
 * One state function for the whole popup. Priority: connection problems (offline, token, version), active playback, engine
 * start-up, page problems (PDF, restricted page, file access), then idle / selection. The engine state "unloaded" is a normal resting state
 * (Wakes on play): it never produces an error view, and while a play request waits for it the popup shows loading-model.
 */
export function deriveView(i: PopupInputs): PopupView {
  const code = i.player?.status === "error" ? i.player.error?.code : undefined;
  return connectionView(i, code) ?? playbackView(i, code) ?? pageView(i, code);
}

type Tone = "ok" | "warn" | "err" | "neutral";
export function headerBadge(view: PopupView, engine?: Parameters<typeof engineBadge>[0]): { tone: Tone; label: string } {
  switch (view) {
    case "install":
      return { tone: "neutral", label: "Not set up" };
    case "offline":
      return { tone: "err", label: "App offline" };
    case "token":
      return { tone: "warn", label: "Not paired" };
    case "version":
      return { tone: "warn", label: "Update needed" };
    case "loading-model":
      return { tone: "warn", label: engine === "unloaded" ? "Waking up" : "Loading model" };
    case "engine-missing":
      return { tone: "warn", label: "No voice engine" };
    default:
      return engineBadge(engine);
  }
}
