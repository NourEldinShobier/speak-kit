import { useState } from "react";
import type { PlayerState } from "@speakkit/protocol";
import { Icon, IconButton, Slider, Button } from "@speakkit/ui";
import { clock, timeLeft } from "../../shared/format";

export interface TransportActions {
  toggle(): void;
  replay(): void;
  seekMs(delta: number): void;
  seekTo(ms: number): void;
  block(dir: 1 | -1): void;
}

/** Seek bar with the elapsed / remaining line. Dragging shows the target; releasing seeks. */
export function Scrubber({ p, finished, a }: { p: PlayerState; finished: boolean; a: Pick<TransportActions, "seekTo"> }) {
  const total = Math.max(p.totalMs, 1);
  const el = finished ? total : Math.min(p.elapsedMs, total);
  const [drag, setDrag] = useState<number | null>(null);
  const v = drag ?? el;
  return (
    <div className="pp-scrub">
      <Slider
        aria-label="Seek"
        value={v}
        min={0}
        max={total}
        step={100}
        onChange={setDrag}
        onCommit={(x) => {
          setDrag(null);
          a.seekTo(x);
        }}
      />
      <div className="pp-times">
        <span>{clock(v)}</span>
        <span>{finished ? "Finished" : timeLeft(v, total)}</span>
      </div>
    </div>
  );
}

export type TransportStatus = "playing" | "paused" | "finished" | "busy";

/** previous paragraph, back 10 s, play/pause (40 px round), forward 10 s, next paragraph. */
export function Transport({ status, a }: { status: TransportStatus; a: TransportActions }) {
  const busy = status === "busy";
  const label = busy ? "Preparing" : status === "playing" ? "Pause" : status === "finished" ? "Replay from the start" : "Play";
  return (
    <div className="pp-transport">
      <IconButton name="player-skip-back" label="Previous paragraph" size={28} disabled={busy} onClick={() => a.block(-1)} />
      <IconButton name="rewind-backward-10" label="Back 10 seconds" disabled={busy} onClick={() => a.seekMs(-10000)} />
      <Button
        variant="primary"
        className="sk-primary-round"
        aria-label={label}
        disabled={busy}
        onClick={() => (status === "finished" ? a.replay() : a.toggle())}
      >
        <Icon name={busy ? "loader-2" : status === "playing" ? "player-pause" : status === "finished" ? "refresh" : "player-play"} size={20} className={busy ? "lm-spin" : undefined} />
      </Button>
      <IconButton name="rewind-forward-10" label="Forward 10 seconds" disabled={busy} onClick={() => a.seekMs(10000)} />
      <IconButton name="player-skip-forward" label="Next paragraph" size={28} disabled={busy} onClick={() => a.block(1)} />
    </div>
  );
}
