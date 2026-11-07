import { engine } from "./connection";
import { runPlayerCommand } from "./player";
import { activeTabId, startRead } from "./reading";
import { getState } from "./state";

export const onCommand = async (name: string, tab?: chrome.tabs.Tab) => {
  const tabId = tab?.id ?? (await activeTabId());
  const state = await getState();
  const live = state.status === "playing" || state.status === "paused" || state.status === "preparing";
  if (name === "stop") await runPlayerCommand({ cmd: "stop" });
  else if (name === "play-pause" && live) await runPlayerCommand({ cmd: "toggle" });
  else if ((name === "read-selection" || name === "play-pause") && tabId !== undefined) {
    void engine.warm(); // the model loads while the page text is extracted
    await startRead(tabId, "selection", { fallbackToPage: true });
  }
};
