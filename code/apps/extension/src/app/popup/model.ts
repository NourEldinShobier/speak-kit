import type { PlayerState } from "@speakkit/protocol";
import { deriveView, type PopupView } from "../../features/connection";
import type { Settings } from "../../features/settings";
import type { VoicesState } from "../../features/voices";
import type { HealthResult, QueueSnapshot } from "../../shared/client";
import { hostOf } from "../../shared/format";
import type { PopupModel } from "./types";
import type { TabInfo } from "./useTab";

interface ModelInputs {
  player: PlayerState | null;
  token: string;
  health: HealthResult | null;
  settings: Settings;
  tab: TabInfo;
  queue: QueueSnapshot | null;
  commands: chrome.commands.Command[] | null;
  voices: VoicesState;
  launch: PopupModel["launch"];
  starting: boolean;
}

/** Test builds can pin a state that needs no player data (file:// permission cannot be reached from a Playwright tab). */
const pinnedView = (): PopupView | null => (__TEST__ ? (new URLSearchParams(location.search).get("view") as PopupView | null) : null);

function viewOf(i: ModelInputs): PopupView {
  const { tab } = i;
  return (
    pinnedView() ??
    deriveView({
      hasToken: !!i.token,
      health: i.health,
      player: i.player,
      tabUrl: tab.url ?? (tab.id !== undefined ? "about:restricted" : undefined),
      fileAccess: tab.fileAccess,
      selection: tab.selection,
      starting: i.starting,
    })
  );
}

/** The player, when something is loaded or playing; its title, voice and speed then win over the tab and the settings. */
const activePlayer = (p: PlayerState | null) => (p && p.status !== "idle" ? p : null);

/** Title, host, voice and speed: the loaded document's while one plays, otherwise the tab's and the settings'. */
function shownFields({ player, tab, settings }: ModelInputs) {
  const active = activePlayer(player);
  return {
    title: active?.title || tab.title || hostOf(tab.url) || "This page",
    host: hostOf(active ? active.url : tab.url) || "this page",
    voice: active?.voice || settings.voice,
    speed: active?.speed || settings.speed,
  };
}

function engineFields(health: HealthResult | null): Pick<PopupModel, "engine" | "engineProgress"> {
  const engine = health && health.ok ? health.health.engine : undefined;
  return { engine: engine?.state, engineProgress: engine?.state === "downloading" ? (engine.progress ?? 0) : undefined };
}

/** Everything the popup shows, from the hooks' raw values. */
export function buildModel(i: ModelInputs): PopupModel {
  const { player, tab, queue } = i;
  return {
    view: viewOf(i),
    ...shownFields(i),
    ...engineFields(i.health),
    player,
    selection: tab.selection,
    chars: tab.chars,
    next: queue?.items[0],
    queued: queue?.items.length ?? player?.queueLength ?? 0,
    voices: i.voices,
    shortcuts: Object.fromEntries((i.commands ?? []).map((c) => [c.name ?? "", c.shortcut || undefined])),
    launch: i.launch,
  };
}
