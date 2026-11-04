import { useMemo } from "react";
import type { QueueItem } from "../../shared/client";
import { command, openOptions, previewVoice, send } from "../../shared/client";
import { extensionSettingsUrl, LINKS, openUrl } from "../../shared/links";
import type { Settings } from "../../features/settings";
import type { PopupActions, PopupModel } from "./types";
import type { TabUiMessage } from "../../shared/internal";
import { activeTab } from "./useTab";

const SAMPLE = "This is how this voice sounds when it reads to you.";

interface Deps {
  tabId?: number | undefined;
  elapsedMs: number;
  next?: QueueItem | undefined;
  speed: number;
  update: (fn: (s: Settings) => Settings) => void;
  refresh: () => Promise<unknown>;
  setToken: (t: string) => void;
  setStarting: (on: boolean) => void;
  setLaunch: (s: PopupModel["launch"]) => void;
}

type Group = Pick<PopupActions, "listenPage" | "listenSelection" | "readerView" | "showOnPage">;

// The tab may still be loading when the button is clicked right after the popup opens.
const resolveTab = async (d: Deps) => d.tabId ?? (await activeTab())?.id;

function readActions(d: Deps): Group {
  const listen = (mode: "page" | "selection") => async () => {
    const id = await resolveTab(d);
    if (id === undefined) return;
    d.setStarting(true);
    void send({ t: "read-tab", tabId: id, mode });
  };
  return {
    listenPage: listen("page"),
    listenSelection: listen("selection"),
    showOnPage: async () => {
      const id = await resolveTab(d);
      if (id === undefined) return;
      await chrome.tabs.sendMessage(id, { t: "tab-ui" } satisfies TabUiMessage);
      if (!__TEST__) window.close();
    },
    readerView: async () => {
      const id = await resolveTab(d);
      if (id === undefined) return;
      await send({ t: "reader", tabId: id, open: true });
      if (!__TEST__) window.close();
    },
  };
}

type Playback = Pick<PopupActions, "toggle" | "stop" | "replay" | "seekMs" | "seekTo" | "block" | "setVoice" | "setSpeed" | "preview" | "playNext">;

function playbackActions(d: Deps): Playback {
  return {
    toggle: () => void command({ cmd: "toggle" }),
    stop: () => void command({ cmd: "stop" }),
    replay: () => void command({ cmd: "seek-sentence", index: 0 }).then(() => command({ cmd: "resume" })),
    seekMs: (delta) => void command({ cmd: "seek-ms", deltaMs: delta }),
    seekTo: (ms) => void command({ cmd: "seek-ms", deltaMs: ms - d.elapsedMs }),
    block: (dir) => void command({ cmd: dir > 0 ? "next-block" : "prev-block" }),
    setVoice: (id) => {
      d.update((s) => ({ ...s, voice: id }));
      void command({ cmd: "set-voice", voice: id });
    },
    setSpeed: (v) => {
      d.update((s) => ({ ...s, speed: v }));
      void command({ cmd: "set-speed", speed: v });
    },
    preview: (id) => void previewVoice(id, SAMPLE, d.speed),
    playNext: () => {
      if (d.next) void command({ cmd: "queue-play", docId: d.next.docId });
    },
  };
}

function appActions(d: Deps): Omit<PopupActions, keyof Group | keyof Playback> {
  return {
    openApp: async () => {
      d.setLaunch("starting");
      const r = await send<{ ok: boolean }>({ t: "launch-app" });
      d.setLaunch(r?.ok ? "idle" : "failed");
      if (r?.ok) void d.refresh();
    },
    download: () => void openUrl(LINKS.download),
    recheck: () => void d.refresh(),
    options: () => void openOptions(),
    extSettings: () => void openUrl(extensionSettingsUrl()),
    help: () => void openUrl(LINKS.help),
    learn: () => void openUrl(LINKS.learn),
  };
}

/** The popup's button handlers. Rebuilt only when something they read changes. */
export function usePopupActions(d: Deps): PopupActions {
  const { tabId, elapsedMs, next, speed, update, refresh, setToken, setStarting, setLaunch } = d;
  return useMemo(() => {
    const deps = { tabId, elapsedMs, next, speed, update, refresh, setToken, setStarting, setLaunch };
    return { ...readActions(deps), ...playbackActions(deps), ...appActions(deps) };
  }, [tabId, elapsedMs, next, speed, update, refresh, setToken, setStarting, setLaunch]);
}
