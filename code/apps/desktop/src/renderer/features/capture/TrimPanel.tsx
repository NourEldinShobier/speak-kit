import { useState } from "react";
import { Banner, Button, Slider } from "@speakkit/ui";
import { MIN_TRIM_MS } from "../../../shared/capture/contract";
import { duration } from "./format";
import { clampTrim } from "./trim-range";

interface Props {
  durationMs: number;
  /** The range kept now, when the video was cut before. */
  kept?: { startMs: number; endMs: number } | undefined;
  onCancel(): void;
  /** Resolves true when the video was cut. */
  onSave(startMs: number, endMs: number): Promise<boolean>;
}

const STEP_MS = 500;

/** Cuts the video of a recording to a start and an end. The original video file stays; the cut is saved next to it. */
export function TrimPanel({ durationMs, kept, onCancel, onSave }: Props) {
  const [range, setRange] = useState({ startMs: kept?.startMs ?? 0, endMs: Math.min(kept?.endMs ?? durationMs, durationMs) });
  const [phase, setPhase] = useState<"idle" | "saving" | "failed">("idle");
  const set = (which: "start" | "end") => (ms: number) => setRange((r) => clampTrim(r, { which, ms, durationMs }));
  const save = async () => {
    setPhase("saving");
    const ok = await onSave(range.startMs, range.endMs).catch(() => false);
    if (!ok) setPhase("failed");
  };
  const tooShort = durationMs < MIN_TRIM_MS * 2;
  return (
    <section className="cap-trim" aria-label="Trim video">
      <h3 className="cap-trim__title">Trim video</h3>
      <p className="cap-detail__meta">Keeps the part between the two sliders. The original video file stays in the capture folder.</p>
      <label className="cap-trim__row">
        <span>Start {duration(range.startMs)}</span>
        <Slider aria-label="Start" min={0} max={durationMs} step={STEP_MS} value={range.startMs} onChange={set("start")} disabled={phase === "saving" || tooShort} />
      </label>
      <label className="cap-trim__row">
        <span>End {duration(range.endMs)}</span>
        <Slider aria-label="End" min={0} max={durationMs} step={STEP_MS} value={range.endMs} onChange={set("end")} disabled={phase === "saving" || tooShort} />
      </label>
      {phase === "failed" ? (
        <Banner tone="error" title="The video could not be cut">
          Nothing was changed. Try again, or keep the whole video.
        </Banner>
      ) : null}
      <div className="cap-actions">
        <Button variant="primary" loading={phase === "saving"} disabled={tooShort || phase === "saving"} onClick={() => void save()}>
          {phase === "saving" ? "Cutting, this takes as long as the video" : "Save trimmed video"}
        </Button>
        <Button disabled={phase === "saving"} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
