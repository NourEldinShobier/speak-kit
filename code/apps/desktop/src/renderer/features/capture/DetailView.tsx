import { useEffect, useState } from "react";
import { Banner, Button, Icon, Skeleton } from "@speakkit/ui";
import type { CaptureDetail, CopyWhat } from "../../../shared/capture/contract";
import { capture } from "./api";
import { duration, itemSubtitle } from "./format";

interface Props {
  id: string;
  platform: string;
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

function Actions({ detail, platform, onCopied, onDelete }: { detail: CaptureDetail; platform: string; onCopied(what: CopyWhat): void; onDelete(): void }) {
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

function Opened({ detail, platform, onDelete }: { detail: CaptureDetail; platform: string; onDelete(): void }) {
  const [copied, setCopied] = useState<CopyWhat | null>(null);
  return (
    <>
      <h2 className="cap-detail__title">{detail.title}</h2>
      <p className="cap-detail__meta">{itemSubtitle(detail)}</p>
      <div className="cap-frames" role="list" aria-label="Frames">
        {detail.frames.map((f) => (
          <figure key={f.atMs} role="listitem">
            <img src={f.src} alt={`Frame at ${duration(f.atMs)}`} />
            <figcaption>{duration(f.atMs)}</figcaption>
          </figure>
        ))}
      </div>
      <Narration words={detail.words} />
      <Actions detail={detail} platform={platform} onCopied={setCopied} onDelete={onDelete} />
      <span className="cap-sr" role="status">
        {copied ? `Copied ${copied}` : ""}
      </span>
    </>
  );
}

function Body({ detail, platform, onDelete }: { detail: CaptureDetail | null | undefined; platform: string; onDelete(item: CaptureDetail): void }) {
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
  return <Opened detail={detail} platform={platform} onDelete={() => onDelete(detail)} />;
}

/** One capture opened: its keyframes, the narration with times, and the actions on it. */
export function DetailView({ id, platform, onBack, onDelete }: Props) {
  const [detail, setDetail] = useState<CaptureDetail | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    capture.detail(id).then(
      (d) => live && setDetail(d),
      () => live && setDetail(null),
    );
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <div className="cap-detail" data-testid="capture-detail">
      <Button iconLeft="arrow-left" onClick={onBack}>
        Captures
      </Button>
      <Body detail={detail} platform={platform} onDelete={onDelete} />
    </div>
  );
}
