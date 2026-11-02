import { useState } from "react";
import { Banner, Button, ProgressBar } from "@speakkit/ui";
import type { ExportView } from "../../../shared/export";
import { api, formatBytes } from "../../ui";
import { errorText } from "../../error-text";
import type { ExportAction } from "./model";

const STAGE_TEXT = { encoding: "Encoding the MP3", saving: "Saving the file" } as const;

function RenderingBody({ job }: { job: ExportView }) {
  const text = job.stage === "rendering" ? `Rendering sentence ${Math.min(job.done + 1, job.total)} of ${job.total}` : STAGE_TEXT[job.stage as keyof typeof STAGE_TEXT];
  return (
    <div data-testid="export-progress" data-stage={job.stage}>
      <p className="sk-modal-text">{text}</p>
      <ProgressBar value={Math.round(job.progress * 100)} label={`Export of ${job.name}`} />
      <p className="sk-modal-text">You can close this window; the export keeps running and you get a notification when it is done.</p>
    </div>
  );
}

function DoneBody({ job }: { job: ExportView }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await api.copy(job.path!);
    setCopied(true);
  };
  return (
    <div data-testid="export-done">
      <p className="sk-modal-text">
        {job.name} · {formatBytes(job.bytes ?? 0)}
        {job.durationMs ? ` · ${Math.round(job.durationMs / 1000)} s` : ""}
      </p>
      <div className="sk-row-actions">
        <code className="sk-path" title={job.path}>
          {job.path}
        </code>
        <Button size="sm" iconLeft="copy" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

interface JobProps {
  job: ExportView;
  onClose(): void;
  dispatch(a: ExportAction): void;
}

export function renderingView({ job, onClose }: JobProps) {
  return {
    body: <RenderingBody job={job} />,
    footer: (
      <>
        <Button variant="danger" onClick={() => api.exportCancel(job.id)}>
          Cancel export
        </Button>
        <span style={{ flex: 1 }} />
        <Button variant="primary" onClick={onClose}>
          Run in background
        </Button>
      </>
    ),
  };
}

export function doneView({ job, onClose }: JobProps) {
  return {
    body: <DoneBody job={job} />,
    footer: (
      <>
        <Button iconLeft="folder" onClick={() => api.exportReveal(job.path!, false)}>
          Show in folder
        </Button>
        <span style={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
        <Button variant="primary" iconLeft="player-play" onClick={() => api.exportReveal(job.path!, true)}>
          Open file
        </Button>
      </>
    ),
  };
}

export function endedView({ job, onClose, dispatch }: JobProps) {
  const body =
    job.stage === "error" ? (
      <Banner tone="error" title="The export did not finish">
        {job.error && errorText(job.error)}
      </Banner>
    ) : (
      <p className="sk-modal-text">The export was cancelled. No file was written.</p>
    );
  const footer = (
    <>
      <Button onClick={onClose}>Close</Button>
      <Button variant="primary" onClick={() => dispatch({ type: "back-to-options" })}>
        Back to options
      </Button>
    </>
  );
  return { body, footer };
}
