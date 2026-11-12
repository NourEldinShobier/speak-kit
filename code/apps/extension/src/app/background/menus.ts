import { loadSettings } from "../../features/settings";
import { startRead } from "./reading";

const MENU = {
  parent: "speakkit",
  selection: "speakkit-read-selection",
  here: "speakkit-read-from-here",
  queue: "speakkit-add-queue",
} as const;

let built: boolean | undefined;
/** The menu entries currently registered (chrome.contextMenus has no getAll; test builds keep this log for the e2e hooks). */
export const menuLog: chrome.contextMenus.CreateProperties[] = [];
const addMenu = (p: chrome.contextMenus.CreateProperties) => {
  if (__TEST__) menuLog.push(p);
  chrome.contextMenus.create(p);
};

export async function rebuildMenus(): Promise<void> {
  built = (await loadSettings()).show.contextMenu;
  await chrome.contextMenus.removeAll();
  if (__TEST__) menuLog.length = 0;
  if (!built) return;
  addMenu({ id: MENU.parent, title: "Speak Kit", contexts: ["all"] });
  addMenu({ id: MENU.selection, parentId: MENU.parent, title: "Read selection", contexts: ["selection"] });
  addMenu({ id: MENU.here, parentId: MENU.parent, title: "Read from here", contexts: ["all"] });
  addMenu({ id: MENU.queue, parentId: MENU.parent, title: "Add to queue", contexts: ["all"] });
}

/** The menu follows the "context menu" setting; rebuild only when it changed. */
export const menusStale = (enabled: boolean) => built !== enabled;

export const onMenuClick = async (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  const tabId = tab?.id;
  if (tabId === undefined) return;
  if (info.menuItemId === MENU.selection) await startRead(tabId, "selection");
  else if (info.menuItemId === MENU.here) await startRead(tabId, "from-here");
  else if (info.menuItemId === MENU.queue) await startRead(tabId, info.selectionText ? "selection" : "page", { queue: true });
};
