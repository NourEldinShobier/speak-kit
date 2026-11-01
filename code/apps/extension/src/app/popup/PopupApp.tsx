import { useEffect, useMemo, useState } from "react";
import { deriveView, useHealth, type PopupView } from "../../features/connection";
import { extensionSettingsUrl, LINKS, openUrl } from "../../shared/links";
import { usePlayerState } from "../../features/player";
import { useQueue } from "../../features/queue";
import { useSettings, useToken } from "../../features/settings";
import { useCommands } from "../../features/settings";
import { useVoices } from "../../features/voices";
import { command, openOptions, previewVoice, send, warm } from "../../shared/client";
import { hostOf } from "../../shared/format";
import { PopupScreen, type PopupActions, type PopupModel } from "./Popup";
import { activeTab, useTab } from "./useTab";

const SAMPLE = "This is how this voice sounds when it reads to you.";

export function PopupApp() {
  const player = usePlayerState();
  const { token, ready: tokenReady, set: setToken } = useToken();
  const { result: health, refresh } = useHealth();
  const { settings, update } = useSettings();
  const tab = useTab();
  const queue = useQueue(player);
  const cmds = useCommands();
  const [launch, setLaunch] = useState<PopupModel["launch"]>("idle");

  // The popup opening is the earliest hint that the user may press play: load the model now.
  useEffect(() => warm("popup"), []);

  // Test builds can pin a state that needs no player data (file:// permission cannot be reached from a Playwright tab).
  const pinned = __TEST__ ? (new URLSearchParams(location.search).get("view") as PopupView | null) : null;
  const view = pinned ?? deriveView({
    hasToken: !!token,
    health,
    player,
    tabUrl: tab.url ?? (tab.id !== undefined ? "about:restricted" : undefined),
    fileAccess: tab.fileAccess,
    selection: tab.selection,
  });
  const active = player && player.status !== "idle";
  const engine = health && health.ok ? health.health.engine : undefined;
  const voices = useVoices(!!health && health.ok);

  const model: PopupModel = {
    view,
    title: (active && player.title) || tab.title || hostOf(tab.url) || "This page",
    host: hostOf(active ? player.url : tab.url) || "this page",
    player,
    voice: (active && player.voice) || settings.voice,
    speed: (active && player.speed) || settings.speed,
    selection: tab.selection,
    chars: tab.chars,
    next: queue?.items[0],
    queued: queue?.items.length ?? player?.queueLength ?? 0,
    engine: engine?.state,
    engineProgress: engine?.state === "downloading" ? engine.progress ?? 0 : undefined,
    voices,
    shortcuts: Object.fromEntries((cmds ?? []).map((c) => [c.name ?? "", c.shortcut || undefined])),
    launch,
  };

  const actions = useMemo<PopupActions>(() => {
    const elapsed = () => player?.elapsedMs ?? 0;
    return {
      // The tab may still be loading when the button is clicked right after the popup opens.
      listenPage: async () => { const id = tab.id ?? (await activeTab())?.id; if (id !== undefined) void send({ t: "read-tab", tabId: id, mode: "page" }); },
      listenSelection: async () => { const id = tab.id ?? (await activeTab())?.id; if (id !== undefined) void send({ t: "read-tab", tabId: id, mode: "selection" }); },
      readerView: async () => {
        const id = tab.id ?? (await activeTab())?.id;
        if (id !== undefined) { await send({ t: "reader", tabId: id, open: true }); if (!__TEST__) window.close(); }
      },
      toggle: () => void command({ cmd: "toggle" }),
      stop: () => void command({ cmd: "stop" }),
      replay: () => void command({ cmd: "seek-sentence", index: 0 }).then(() => command({ cmd: "resume" })),
      seekMs: (d) => void command({ cmd: "seek-ms", deltaMs: d }),
      seekTo: (ms) => void command({ cmd: "seek-ms", deltaMs: ms - elapsed() }),
      block: (d) => void command({ cmd: d > 0 ? "next-block" : "prev-block" }),
      setVoice: (id) => { update((s) => ({ ...s, voice: id })); void command({ cmd: "set-voice", voice: id }); },
      setSpeed: (v) => { update((s) => ({ ...s, speed: v })); void command({ cmd: "set-speed", speed: v }); },
      preview: (id) => void previewVoice(id, SAMPLE, settings.speed),
      playNext: () => { const n = queue?.items[0]; if (n) void command({ cmd: "queue-play", docId: n.docId }); },
      openApp: async () => {
        setLaunch("starting");
        const r = await send<{ ok: boolean }>({ t: "launch-app" });
        setLaunch(r?.ok ? "idle" : "failed");
        if (r?.ok) void refresh();
      },
      download: () => void openUrl(LINKS.download),
      recheck: () => void refresh(),
      pasteToken: async () => {
        try {
          const t = (await navigator.clipboard.readText()).trim();
          if (t.length >= 8 && !/\s/.test(t)) { setToken(t); await refresh(); return; }
        } catch { /* clipboard permission denied */ }
        void openOptions();
      },
      options: () => void openOptions(),
      extSettings: () => void openUrl(extensionSettingsUrl()),
      help: () => void openUrl(LINKS.help),
      learn: () => void openUrl(LINKS.learn),
    };
  }, [tab.id, player?.elapsedMs, queue, settings.speed, update, refresh, setToken]);

  if (!tokenReady || health === null) return <div className="lm pp pp-wait" aria-busy="true" />;
  return <PopupScreen m={model} a={actions} />;
}
