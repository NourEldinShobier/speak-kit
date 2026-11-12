import { useState } from "react";
import { Banner, Button, Select, Slider } from "@speakkit/ui";
import type { CaptureDetail } from "../../../shared/capture/contract";
import { cropOfRegion, normalizeRegions, ZOOM, type ZoomRegion } from "../../../shared/capture/zoom";
import { duration } from "./format";
import { clampTrim } from "./trim-range";

interface Props {
  detail: CaptureDetail;
  onCancel(): void;
  /** Resolves true when the video was zoomed (no regions: put back as it was). */
  onSave(regions: ZoomRegion[]): Promise<boolean>;
  /** Zooms chosen from where the pointer rested and where the pen drew. */
  onSuggest(): Promise<ZoomRegion[]>;
}

const SCALES = [1.5, 2, 3, 4];
const percent = (n: number) => `${Math.round(n * 100)}%`;

/** The picture of the region: the frame nearest its start, with the part the zoom shows outlined. */
function Preview({ detail, region }: { detail: CaptureDetail; region: ZoomRegion }) {
  const frame = detail.frames.reduce<CaptureDetail["frames"][number] | undefined>(
    (best, f) => (!best || Math.abs(f.atMs - region.startMs) < Math.abs(best.atMs - region.startMs) ? f : best),
    undefined,
  );
  if (!frame) return null;
  const c = cropOfRegion(region);
  return (
    <div className="cap-zoom__preview">
      <img src={frame.src} alt={`Frame at ${duration(frame.atMs)}`} />
      <span className="cap-zoom__box" aria-hidden="true" style={{ left: percent(c.x), top: percent(c.y), width: percent(c.width), height: percent(c.height) }} />
    </div>
  );
}

function RegionList({ regions, onRemove }: { regions: ZoomRegion[]; onRemove(i: number): void }) {
  if (!regions.length) return <p className="cap-detail__meta">No zoom yet. Set a start, an end and a place, then add it. Or let Speak Kit suggest zooms from where the pointer rested.</p>;
  return (
    <ul className="cap-zoom__list" aria-label="Zooms">
      {regions.map((r, i) => (
        <li key={`${r.startMs}-${i}`}>
          <span>
            {duration(r.startMs)} to {duration(r.endMs)}, {r.scale}x at {percent(r.x)} across, {percent(r.y)} down
          </span>
          <Button size="sm" aria-label={`Remove the zoom at ${duration(r.startMs)}`} onClick={() => onRemove(i)}>
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Place({ draft, busy, set }: { draft: ZoomRegion; busy: boolean; set(patch: Partial<ZoomRegion>): void }) {
  return (
    <>
      <label className="cap-trim__row">
        <span>Across {percent(draft.x)}</span>
        <Slider aria-label="Zoom across" min={0} max={100} step={5} value={Math.round(draft.x * 100)} onChange={(n) => set({ x: n / 100 })} disabled={busy} />
      </label>
      <label className="cap-trim__row">
        <span>Down {percent(draft.y)}</span>
        <Slider aria-label="Zoom down" min={0} max={100} step={5} value={Math.round(draft.y * 100)} onChange={(n) => set({ y: n / 100 })} disabled={busy} />
      </label>
      <Select label="Zoom level" value={String(draft.scale)} onChange={(v) => set({ scale: Number(v) })} options={SCALES.map((s) => ({ value: String(s), label: `${s}x` }))} />
    </>
  );
}

type Phase = "idle" | "saving" | "failed" | "nothing";

function Span({ draft, length, disabled, onChange }: { draft: ZoomRegion; length: number; disabled: boolean; onChange(patch: Partial<ZoomRegion>): void }) {
  const move = (which: "start" | "end") => (ms: number) => {
    const next = clampTrim(draft, { which, ms, durationMs: length, minMs: ZOOM.minMs });
    onChange(next);
  };
  return (
    <>
      <label className="cap-trim__row">
        <span>Start {duration(draft.startMs)}</span>
        <Slider aria-label="Zoom start" min={0} max={length} step={500} value={draft.startMs} onChange={move("start")} disabled={disabled} />
      </label>
      <label className="cap-trim__row">
        <span>End {duration(draft.endMs)}</span>
        <Slider aria-label="Zoom end" min={0} max={length} step={500} value={draft.endMs} onChange={move("end")} disabled={disabled} />
      </label>
    </>
  );
}

function Notices({ phase }: { phase: Phase }) {
  if (phase === "nothing")
    return (
      <Banner tone="info" title="No zoom to suggest">
        The pointer did not rest anywhere and nothing was drawn, or the input log was off for this capture.
      </Banner>
    );
  if (phase === "failed")
    return (
      <Banner tone="error" title="The video could not be zoomed">
        Nothing was changed. Try again, or keep the video as it is.
      </Banner>
    );
  return null;
}

function saveLabel(busy: boolean, hasRegions: boolean): string {
  if (busy) return "Zooming, this takes as long as the video";
  return hasRegions ? "Save zoomed video" : "Remove zoom";
}

/** Chooses the parts of a video to show closer. The original video file stays; the zoomed copy is saved next to it. */
export function ZoomPanel({ detail, onCancel, onSave, onSuggest }: Props) {
  const length = detail.trim ? detail.trim.endMs - detail.trim.startMs : (detail.durationMs ?? 0);
  const [regions, setRegions] = useState<ZoomRegion[]>(detail.zoom ?? []);
  const [draft, setDraft] = useState<ZoomRegion>({ startMs: 0, endMs: Math.min(length, 4000), x: 0.5, y: 0.5, scale: ZOOM.defaultScale });
  const [phase, setPhase] = useState<Phase>("idle");
  const busy = phase === "saving";
  const edit = (patch: Partial<ZoomRegion>) => setDraft((d) => ({ ...d, ...patch }));
  const suggest = async () => {
    const found = await onSuggest().catch(() => []);
    setPhase(found.length ? "idle" : "nothing");
    if (found.length) setRegions(found);
  };
  const save = async () => {
    setPhase("saving");
    if (!(await onSave(regions).catch(() => false))) setPhase("failed");
  };
  const unusable = busy || length < ZOOM.minMs * 2;
  return (
    <section className="cap-trim cap-zoom" aria-label="Zoom video">
      <h3 className="cap-trim__title">Zoom video</h3>
      <p className="cap-detail__meta">Shows parts of the video closer. The original video file stays in the capture folder.</p>
      <Preview detail={detail} region={draft} />
      <Span draft={draft} length={length} disabled={unusable} onChange={edit} />
      <Place draft={draft} busy={busy} set={edit} />
      <div className="cap-actions">
        <Button disabled={unusable} onClick={() => setRegions((rs) => normalizeRegions([...rs, draft], length))}>
          Add zoom
        </Button>
        <Button disabled={unusable} onClick={() => void suggest()}>
          Suggest zooms
        </Button>
      </div>
      <RegionList regions={regions} onRemove={(i) => setRegions((rs) => rs.filter((_, k) => k !== i))} />
      <Notices phase={phase} />
      {detail.zoomSheet ? <img className="cap-zoom__sheet" src={detail.zoomSheet} alt="Contact sheet of the zoomed parts" /> : null}
      <div className="cap-actions">
        <Button variant="primary" loading={busy} disabled={busy || (!regions.length && !detail.zoom?.length)} onClick={() => void save()}>
          {saveLabel(busy, regions.length > 0)}
        </Button>
        <Button disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
