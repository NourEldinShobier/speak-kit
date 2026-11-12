import { createPageReporter, hostOf, postPage } from "../../features/connection";
import { getToken, loadSettings } from "../../features/settings";

const reporter = createPageReporter({
  send: (host) => postPage({ fetch: (i, init) => fetch(i, init), port: async () => (await loadSettings()).port, token: getToken }, host),
  now: Date.now,
});

/** The website in the browser window that has focus; "" when the browser is not the window in front. */
function frontHost(): Promise<string> {
  return chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] }).then(
    (w) => (w.focused ? hostOf(w.tabs?.find((t) => t.active)?.url) : ""),
    () => "", // no window to ask: nothing is in front
  );
}

const ALARM = "page-context";

/** Keeps the app told which page is in front: on every tab or window change, and every 30 seconds so the app does not let it expire. */
export function watchFrontPage(): void {
  const send = () => void frontHost().then((h) => reporter.report(h));
  chrome.tabs.onActivated.addListener(send);
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.url || info.status === "complete") send();
  });
  chrome.windows.onFocusChanged.addListener(send);
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARM) send();
  });
  void chrome.alarms.get(ALARM).then((a) => (a ? undefined : chrome.alarms.create(ALARM, { periodInMinutes: 0.5 })));
  send();
}
