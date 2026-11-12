import { useEffect, useState } from "react";
import { Banner, Button, Icon, Skeleton } from "@speakkit/ui";
import type { CaptureDetail, CopyWhat, EditSource } from "../../../shared/capture/contract";
import type { ZoomRegion } from "../../../shared/capture/zoom";
import { capture } from "./api";
import { AnnotateEditor } from "./annotate/AnnotateEditor";
import { duration, itemSubtitle } from "./format";
import { TrimPanel } from "./TrimPanel";
import { ZoomPanel } from "./ZoomPanel";

interface Props {
  id: string;
  platform: string;
  /** The zoom experiment is on. */
  zoomOn: boolean;
  onBack(): void;
  onDelete(item: CaptureDetail): void;
}

function Narration({ words }: { words: CaptureDetail["words"] }) {
  if (!words.length) return <p className="cap-detail__meta">No narration was saved for this capture.</p>;
  return (
    <p className="cap-words" aria-label="Narration">
      {words.map((w, i) => (
        <span key={i} title={duration(w.startMs)}>
          {w.text}{" "}
        </span>
      ))}
    </p>
  );
}

function Actions({
  detail,
  platform,
  zoomOn,
  onCopied,
  onDelete,
  onTrim,
  onZoom,
}: {
  detail: CaptureDetail;
  platform: string;
  zoomOn: boolean;
  onCopied(what: CopyWhat): void;
  onDelete(): void;
  onTrim(): void;
  onZoom(): void;
}) {
  const copy = async (what: CopyWhat) => {
    if (await capture.copy(detail.id, what)) onCopied(what);
  };
  return (
    <div className="cap-actions">
      <Button onClick={() => void copy("picture")}>Copy picture</Button>
      <Button disabled={!detail.words.length} onClick={() => void copy("text")}>
        Copy text
      </Button>
      <Button onClick={() => void copy("path")}>Copy path</Button>
      {detail.trimmable ? <Button onClick={onTrim}>Trim video</Button> : null}
      {detail.zoomable && zoomOn ? <Button onClick={onZoom}>Zoom video</Button> : null}
      <Button iconLeft="folder" onClick={() => void capture.reveal(detail.id)}>
        {platform === "darwin" ? "Show in Finder" : "Show in folder"}
      </Button>
      <Button className="cap-danger" onClick={onDelete}>
        <Icon name="trash" size={14} />
        Delete
      </Button>
    </div>
  );
}

/** The picture editor of one capture: opens a picture at full size, saves the copy, and says when a picture cannot be opened. */
function useEditing(id: string, onChanged: () => void) {
  const [editing, setEditing] = useState<{ file: string; source: EditSource } | null>(null);
  const [cannotOpen, setCannotOpen] = useState(false);
  return {
    editing,
    cannotOpen,
    closeEditor: () => setEditing(null),
    async openEditor(file: string) {
      setCannotOpen(false);
      let source: EditSource | null = null;
      try {
        source = await capture.source(id, file);
      } catch {
        // the main process could not read it: the banner below says so
      }
      if (source) setEditing({ file, source });
      else setCannotOpen(true);
    },
    async saveEdit(png: Uint8Array) {
      const ok = editing ? await capture.saveEdit(id, editing.file, png).catch(() => false) : false;
      if (ok) onChanged();
      return ok;
    },
  };
}

/** Cuts the video; `done` runs when it was cut. */
const saveTrim = (id: string, done: () => void) => async (startMs: number, endMs: number) => {
  const ok = await capture.trim(id, startMs, endMs);
  if (ok) done();
  return ok;
};

/** Shows parts of the video closer; `done` runs when it was done. */
const saveZoom = (id: string, done: () => void) => async (regions: ZoomRegion[]) => {
  const ok = await capture.zoom(id, regions);
  if (ok) done();
  return ok;
};

function Opened({ detail, platform, zoomOn, onDelete, onChanged }: { detail: CaptureDetail; platform: string; zoomOn: boolean; onDelete(): void; onChanged(): void }) {
  const [copied, setCopied] = useState<CopyWhat | null>(null);
  const [trimming, setTrimming] = useState(false);
  const [zooming, setZooming] = useState(false);
  const { editing, cannotOpen, openEditor, closeEditor, saveEdit } = useEditing(detail.id, onChanged);
  return (
    <>
      <h2 className="cap-detail__title">{detail.title}</h2>
      <p className="cap-detail__meta">{itemSubtitle(detail)}</p>
      <div className="cap-frames" role="list" aria-label="Frames">
        {detail.frames.map((f) => (
          <figure key={f.atMs} role="listitem">
            <img src={f.src} alt={`Frame at ${duration(f.atMs)}`} />
            <figcaption>
              {detail.kind === "screenshot" ? "Picture" : duration(f.atMs)}
              {f.edited ? " (edited)" : ""}
            </figcaption>
            <Button size="sm" aria-label={`Edit picture at ${duration(f.atMs)}`} onClick={() => void openEditor(f.file)}>
              Edit
            </Button>
          </figure>
        ))}
      </div>
      {cannotOpen ? (
        <Banner tone="error" title="The picture could not be opened">
          It may have been moved or removed from the capture folder.
        </Banner>
      ) : null}
      {editing ? <AnnotateEditor source={editing.source} onClose={closeEditor} onSave={saveEdit} /> : null}
      {detail.kind === "recording" ? <p className="cap-detail__meta">Edits change the pictures, the contact sheet that is copied or sent to Voice chat, and nothing in the video file.</p> : null}
      {trimming ? <TrimPanel durationMs={detail.durationMs ?? 0} kept={detail.trim} onCancel={() => setTrimming(false)} onSave={saveTrim(detail.id, () => (setTrimming(false), onChanged()))} /> : null}
      {zooming ? (
        <ZoomPanel detail={detail} onCancel={() => setZooming(false)} onSave={saveZoom(detail.id, () => (setZooming(false), onChanged()))} onSuggest={() => capture.suggestZoom(detail.id)} />
      ) : null}
      <Narration words={detail.words} />
      <Actions detail={detail} platform={platform} zoomOn={zoomOn} onCopied={setCopied} onDelete={onDelete} onTrim={() => setTrimming(true)} onZoom={() => setZooming(true)} />
      <span className="cap-sr" role="status">
        {copied ? `Copied ${copied}` : ""}
      </span>
    </>
  );
}

function Body({
  detail,
  platform,
  zoomOn,
  onDelete,
  onChanged,
}: {
  detail: CaptureDetail | null | undefined;
  platform: string;
  zoomOn: boolean;
  onDelete(item: CaptureDetail): void;
  onChanged(): void;
}) {
  if (detail === undefined)
    return (
      <div className="lm-card" aria-busy="true" aria-label="Loading capture">
        <Skeleton />
      </div>
    );
  if (detail === null)
    return (
      <Banner tone="error" title="This capture is gone">
        It was removed from this computer. Go back to the list.
      </Banner>
    );
  return <Opened detail={detail} platform={platform} zoomOn={zoomOn} onDelete={() => onDelete(detail)} onChanged={onChanged} />;
}

/** One capture opened: its keyframes, the narration with times, and the actions on it. */
export function DetailView({ id, platform, zoomOn, onBack, onDelete }: Props) {
  const [detail, setDetail] = useState<CaptureDetail | null | undefined>(undefined);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    capture.detail(id).then(
      (d) => live && setDetail(d),
      () => live && setDetail(null),
    );
    return () => {
      live = false;
    };
  }, [id, version]);
  return (
    <div className="cap-detail" data-testid="capture-detail">
      <Button iconLeft="arrow-left" onClick={onBack}>
        Captures
      </Button>
      <Body detail={detail} platform={platform} zoomOn={zoomOn} onDelete={onDelete} onChanged={() => setVersion((n) => n + 1)} />
    </div>
  );
}
