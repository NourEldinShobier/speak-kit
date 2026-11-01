import { useMemo, useState } from "react";
import { usePlayerState } from "../../features/player";
import { QueuePanel, useQueue, type PanelActions } from "../../features/queue";
import { useSettings } from "../../features/settings";
import { command, send } from "../../shared/client";
import { activeTab } from "../popup/useTab";

const SPEEDS = [0.5, 1, 1.2, 1.5, 2, 3];

export function SidePanelApp() {
  const state = usePlayerState();
  const fetched = useQueue(state);
  const { update } = useSettings();
  const [autoPlay, setAuto] = useState<boolean | null>(null);
  const queue = fetched ? { ...fetched, autoPlay: autoPlay ?? fetched.autoPlay } : null;

  const actions = useMemo<PanelActions>(() => ({
    toggle: () => void command({ cmd: "toggle" }),
    seekMs: (d) => void command({ cmd: "seek-ms", deltaMs: d }),
    seekTo: (ms) => void command({ cmd: "seek-ms", deltaMs: ms - (state?.elapsedMs ?? 0) }),
    block: (d) => void command({ cmd: d > 0 ? "next-block" : "prev-block" }),
    cycleSpeed: () => {
      const cur = state?.speed ?? 1;
      const next = SPEEDS.find((s) => s > cur + 0.01) ?? SPEEDS[0]!;
      update((s) => ({ ...s, speed: next }));
      void command({ cmd: "set-speed", speed: next });
    },
    seekSentence: (i) => void command({ cmd: "seek-sentence", index: i }),
    playItem: (id) => void command({ cmd: "queue-play", docId: id }),
    removeItem: (id) => void command({ cmd: "queue-remove", docId: id }),
    clear: () => void command({ cmd: "queue-clear" }),
    setAutoPlay: (on) => { setAuto(on); void send({ t: "set-auto-play", on }); },
    addPage: async () => {
      const tab = await activeTab();
      if (tab?.id !== undefined) void send({ t: "read-tab", tabId: tab.id, mode: "page", queue: true });
    },
    close: () => window.close(),
  }), [state?.elapsedMs, state?.speed, update]);

  return <QueuePanel state={state} queue={queue} a={actions} />;
}
