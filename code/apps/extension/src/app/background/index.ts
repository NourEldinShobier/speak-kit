import { SETTINGS_KEY, TOKEN_KEY } from "@speakkit/protocol";
import { invalidateSettings, loadSettings, migrateStoredSettings } from "../../features/settings";
import type { FromOffscreen, WorkerFailure } from "../../shared/internal";
import { parseInbound } from "../../shared/schemas";
import { onCommand } from "./commands";
import { clearHealth } from "./connection";
import { menuLog, menusStale, onMenuClick, rebuildMenus } from "./menus";
import { OFFSCREEN_URL } from "./offscreen";
import { handleOffscreen, runPlayerCommand } from "./player";
import { KNOWN_TYPES, routeSafely } from "./router";
import { getState, sendToPages, sendToTab } from "./state";

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const m = msg as { from?: string; to?: string; t?: string } | null;
  if (m?.from === "offscreen") {
    // Only the offscreen document may speak as the player; a content script cannot.
    if (!sender.tab && sender.url === chrome.runtime.getURL(OFFSCREEN_URL)) void handleOffscreen(m as FromOffscreen);
    return false;
  }
  if (!m || m.to === "offscreen" || typeof m.t !== "string") return false;
  // Trust boundary: content scripts run inside web pages. Anything that is not a well-formed request is dropped.
  const parsed = parseInbound(m);
  if (!parsed) {
    if (KNOWN_TYPES.has(m.t)) sendResponse({ ok: false, error: "invalid-message" } satisfies WorkerFailure);
    return false;
  }
  void routeSafely(parsed, sender).then(sendResponse);
  return true;
});

chrome.commands.onCommand.addListener(onCommand);
chrome.contextMenus.onClicked.addListener(onMenuClick);

// The native menu and the keyboard cannot be driven from Playwright, so tests call the same handlers.
if (__TEST__)
  Object.assign(globalThis, {
    __speakkit: {
      command: (name: string, tabId?: number) => onCommand(name, tabId ? ({ id: tabId } as chrome.tabs.Tab) : undefined),
      menus: () => menuLog.map((m) => m.title ?? ""),
      menuDefs: () => structuredClone(menuLog),
      menu: (id: string, tabId: number, selectionText?: string) => onMenuClick({ menuItemId: id, selectionText } as chrome.contextMenus.OnClickData, { id: tabId } as chrome.tabs.Tab),
    },
  });

chrome.runtime.onInstalled.addListener(async () => {
  await migrateStoredSettings();
  await rebuildMenus();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  void rebuildMenus();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && TOKEN_KEY in changes) clearHealth();
  if (area !== "sync" || !(SETTINGS_KEY in changes)) return;
  invalidateSettings();
  const after = await loadSettings();
  clearHealth();
  if (menusStale(after.show.contextMenu)) void rebuildMenus();
  sendToPages({ t: "settings-changed" });
  for (const t of await chrome.tabs.query({})) sendToTab(t.id, { t: "settings-changed" });
});

// Reading belongs to one page: closing it or navigating away stops playback.
const stopIfPlayingTab = async (tabId: number) => {
  const s = await getState();
  if (s.tabId === tabId && s.status !== "idle") await runPlayerCommand({ cmd: "stop" });
};
chrome.tabs.onRemoved.addListener((tabId) => {
  void stopIfPlayingTab(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") void stopIfPlayingTab(tabId); // also on reload, which carries no url
});
