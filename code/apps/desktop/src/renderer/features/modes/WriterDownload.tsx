import { useState } from "react";
import { Banner, Button, Icon, ProgressBar } from "@speakkit/ui";
import type { WriterCard } from "../../../shared/speech-models/contract";
import { failureText, sizeText, transferText } from "../../speech-text";
import { models } from "../engines";

/** The writer model on this computer, inside the rewrite dialog: its size, the download with progress, pause, resume and cancel, and a failed download with a retry. */
export function WriterDownload({ w }: { w: WriterCard }) {
  const [error, setError] = useState<string | null>(null);
  const run = (f: () => Promise<unknown>) =>
    void f().then(
      () => setError(null),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  const t = w.transfer;
  return (
    <div className="modes-writer" aria-live="polite">
      {w.installed ? (
        <span className="modes-writer__done">
          <Icon name="check" size={14} /> {w.name} is downloaded ({sizeText(w.diskBytes)}). Delete it under Engines, Disk space.
        </span>
      ) : null}
      {!w.installed && t ? (
        <>
          <ProgressBar thin block value={Math.round(t.fraction * 100)} label={`${w.name} download`} />
          <p className="modes-writer__note">{transferText(w)}</p>
          <div className="modes-acts">
            {t.state === "running" ? (
              <Button onClick={() => run(() => models.pauseDownload(w.id))}>Pause</Button>
            ) : (
              <Button variant="primary" onClick={() => run(() => models.resumeDownload(w.id))}>
                Resume
              </Button>
            )}
            <Button onClick={() => run(() => models.cancelDownload(w.id))}>Cancel</Button>
          </div>
        </>
      ) : null}
      {!w.installed && !t ? (
        <>
          {w.failure ? (
            <Banner tone="warning" title="The download did not finish">
              {failureText(w)}
            </Banner>
          ) : null}
          <Button onClick={() => run(() => models.download(w.id))}>{w.failure ? "Try again" : `Download ${w.name}, ${sizeText(w.bytes)}`}</Button>
        </>
      ) : null}
      {error ? <p className="modes-writer__note">{error}</p> : null}
    </div>
  );
}
