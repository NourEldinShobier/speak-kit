import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { IconButton, Logo, ProgressBar } from "@speakkit/ui";
import "@speakkit/ui/lumen.css";
import "./float.css";
import { clock, statusLine } from "../shared/reader";
import { ChunkPlayer, type AudioLike } from "./player";
import { api, useAppState, useTheme } from "./ui";

/** The mini player owns the audio output: main sends sentences here and follows the start and end events. */
const player = new ChunkPlayer((rate) => new AudioContext({ sampleRate: rate }) as unknown as AudioLike, {
  started: (epoch, index) => void api.readerStarted(epoch, index),
  done: (epoch, index) => void api.readerDone(epoch, index),
});
api.onUi((e) => {
  if (e.type === "chunk") player.chunk(e.epoch, e.index, e.audio);
  else if (e.type === "player") player[e.op]();
});

function Mini() {
  const s = useAppState();
  useTheme(s?.config.theme);
  const [onTop, setOnTop] = useState(true);
  useEffect(() => void api.reader({ type: "keep-on-top", on: onTop }), [onTop]);
  if (!s) return null;
  const r = s.reader;
  const active = r.status === "playing" || r.status === "preparing";
  const pct = r.totalMs ? Math.min(100, (r.elapsedMs / r.totalMs) * 100) : 0;
  return (
    <div className="lm mini" data-testid="mini" data-status={r.status}>
      <header className="mini__head">
        <Logo size={18} />
        <div className="mini__title">
          <b title={r.title}>{r.title || "SpeakKit"}</b>
          <span data-testid="mini-status">{statusLine(r)}</span>
        </div>
        <span className="mini__left" data-testid="mini-left">
          {r.status === "finished" ? "" : `${clock(Math.max(0, r.totalMs - r.elapsedMs))} left`}
        </span>
        <IconButton name={onTop ? "lock" : "lock-off"} label={onTop ? "Stop keeping on top" : "Keep on top"} size={24} className="mini__nodrag" onClick={() => setOnTop(!onTop)} />
        <IconButton name="x" label="Close" size={24} className="mini__nodrag" onClick={() => api.reader({ type: "stop" })} />
      </header>
      <ProgressBar thin value={r.status === "preparing" ? undefined : pct} label="Reading progress" />
      <div className="mini__ctl mini__nodrag">
        <IconButton name="player-skip-back" label="Previous sentence" size={28} onClick={() => api.reader({ type: "step", by: -1 })} />
        <IconButton name="rewind-backward-10" label="Back 10 seconds" size={28} onClick={() => api.reader({ type: "skip", ms: -10_000 })} />
        <IconButton
          round
          className="lm-btn--primary"
          name={r.status === "finished" ? "refresh" : active ? "player-pause" : "player-play"}
          label={r.status === "finished" ? "Read again" : active ? "Pause" : "Play"}
          onClick={() => api.reader({ type: "toggle" })}
        />
        <IconButton name="rewind-forward-10" label="Forward 10 seconds" size={28} onClick={() => api.reader({ type: "skip", ms: 10_000 })} />
        <IconButton name="player-skip-forward" label="Next sentence" size={28} onClick={() => api.reader({ type: "step", by: 1 })} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Mini />);
