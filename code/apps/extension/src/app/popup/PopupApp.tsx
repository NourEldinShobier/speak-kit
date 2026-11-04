import { useEffect, useState } from "react";
import { useHealth } from "../../features/connection";
import { usePlayerState } from "../../features/player";
import { useQueue } from "../../features/queue";
import { useCommands, useSettings, useToken } from "../../features/settings";
import { useVoices } from "../../features/voices";
import { warm } from "../../shared/client";
import { buildModel } from "./model";
import { PopupScreen } from "./Popup";
import type { PopupModel } from "./types";
import { usePopupActions } from "./usePopupActions";
import { useTab } from "./useTab";

/** True for 1.5 s after `setStarting(true)`. Between the click and the first player-state broadcast (page extraction) the popup already shows "Waking up" / "Preparing". */
function useStarting(): [boolean, (on: boolean) => void] {
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!starting) return;
    const t = setTimeout(() => setStarting(false), 1500);
    return () => clearTimeout(t);
  }, [starting]);
  return [starting, setStarting];
}

export function PopupApp() {
  const player = usePlayerState();
  const { token, ready: tokenReady, set: setToken } = useToken();
  const { result: health, refresh } = useHealth();
  const { settings, update } = useSettings();
  const tab = useTab();
  const queue = useQueue(player);
  const commands = useCommands();
  const voices = useVoices(!!health && health.ok);
  const [launch, setLaunch] = useState<PopupModel["launch"]>("idle");
  const [starting, setStarting] = useStarting();

  // The popup opening is the earliest hint that the user may press play: load the model now.
  useEffect(() => warm("popup"), []);

  const model = buildModel({ player, token, health, settings, tab, queue, commands, voices, launch, starting });
  const actions = usePopupActions({ tabId: tab.id, elapsedMs: player?.elapsedMs ?? 0, next: queue?.items[0], speed: settings.speed, update, refresh, setToken, setStarting, setLaunch });

  if (!tokenReady || health === null) return <div className="lm pp pp-wait" aria-busy="true" />;
  return <PopupScreen m={model} a={actions} />;
}
