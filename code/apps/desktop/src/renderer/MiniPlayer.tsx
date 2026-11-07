import { IconButton, Logo, ProgressBar } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { clock, type ReaderState } from "../shared/reader";
import { statusLine } from "./status-line";
import { api, playButton } from "./ui";

/** Bar value in percent (undefined = the moving segment while preparing; full when finished) and whether it turns red. */
export function miniProgress(r: Pick<ReaderState, "status" | "elapsedMs" | "totalMs">): { value: number | undefined; error: boolean } {
  const pct = r.totalMs ? Math.min(100, (r.elapsedMs / r.totalMs) * 100) : 0;
  if (r.status === "preparing") return { value: undefined, error: false };
  if (r.status === "finished") return { value: 100, error: false };
  return { value: pct, error: r.status === "error" };
}

/** Play, replay or pause. */
function PlayButton({ status }: { status: string }) {
  const b = playButton(status);
  return <IconButton round className="lm-btn--primary" name={b.name} label={b.label} onClick={() => api.reader({ type: "toggle" })} />;
}

export function MiniPlayer({ s, onTop, setOnTop }: { s: AppState; onTop: boolean; setOnTop(on: boolean): void }) {
  const r = s.reader;
  const bar = miniProgress(r);
  return (
    <div className="lm mini" data-testid="mini" data-status={r.status}>
      <header className="mini__head">
        <Logo size={18} />
        <div className="mini__title">
          <b title={r.title} dir="auto">
            {r.title || "Speak Kit"}
          </b>
          <span data-testid="mini-status">{statusLine(r)}</span>
        </div>
        <span className="mini__left" data-testid="mini-left">
          {r.status === "finished" ? "" : `${clock(Math.max(0, r.totalMs - r.elapsedMs))} left`}
        </span>
        <IconButton name={onTop ? "lock" : "lock-off"} label={onTop ? "Stop keeping on top" : "Keep on top"} size={24} className="mini__nodrag" onClick={() => setOnTop(!onTop)} />
        <IconButton name="x" label="Close" size={24} className="mini__nodrag" onClick={() => api.reader({ type: "stop" })} />
      </header>
      <ProgressBar className={bar.error ? "mini__bar is-error" : "mini__bar"} value={bar.value} label="Reading progress" />
      <div className="mini__ctl mini__nodrag">
        <IconButton name="player-skip-back" label="Previous sentence" size={28} onClick={() => api.reader({ type: "step", by: -1 })} />
        <IconButton name="rewind-backward-10" label="Back 10 seconds" size={28} onClick={() => api.reader({ type: "skip", ms: -10_000 })} />
        <PlayButton status={r.status} />
        <IconButton name="rewind-forward-10" label="Forward 10 seconds" size={28} onClick={() => api.reader({ type: "skip", ms: 10_000 })} />
        <IconButton name="player-skip-forward" label="Next sentence" size={28} onClick={() => api.reader({ type: "step", by: 1 })} />
      </div>
    </div>
  );
}
