import { useEffect, useState } from "react";
import { Banner, Button, Modal, ProgressBar, Segmented, Select, TextInput } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { AppState } from "../shared/ipc";
import { estimateBytes, exportRunning, type ExportConflict, type ExportTarget, type ExportView } from "../shared/export";
import { titleOf } from "../shared/reader";
import { MP3_KBPS } from "../shared/schemas";
import { api, formatBytes, cleanError } from "./ui";

export interface ExportOpen {
  text: string;
  /** File name to suggest; the start of the text when missing. */
  name?: string;
  /** Reopening a running or finished job from the sidebar pill. */
  jobId?: string;
}

/** Export audio (J1 to J5): options, "file exists", rendering with progress, done. Closing while it renders keeps it running in the background (J6). */
export function ExportDialog({ s, open, onClose }: { s: AppState; open: ExportOpen; onClose(): void }) {
  const prefs = s.config.exportPrefs;
  const [text, setText] = useState(open.text);
  const [name, setName] = useState(() => open.name || titleOf(open.text).replace(/…$/, "").slice(0, 40).trim() || "Speak Kit reading");
  const [format, setFormat] = useState(prefs.format);
  const [kbps, setKbps] = useState<number>(prefs.mp3Kbps);
  const [voice, setVoice] = useState(s.config.voice);
  const [dir, setDir] = useState(prefs.folder || s.exportDir);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [exists, setExists] = useState<ExportTarget | null>(null);
  const [jobId, setJobId] = useState<string | null>(open.jobId ?? null);
  const [error, setError] = useState<string | null>(null);
  const job = s.exports.find((e) => e.id === jobId);

  useEffect(() => {
    api.voices().then(
      (v) => setVoices(v.voices),
      () => {},
    );
  }, []);

  const start = async (conflict?: ExportConflict) => {
    setError(null);
    try {
      const target = await api.exportCheck(dir, name, format);
      if (target.exists && !conflict) return setExists(target);
      setExists(null);
      const v = await api.exportStart({ text, voice, speed: s.config.speed, format, mp3Kbps: kbps as (typeof MP3_KBPS)[number], dir, name, ...(target.exists ? { conflict } : {}) });
      setJobId(v.id);
    } catch (e) {
      setError(cleanError(e));
    }
  };
  const browse = async () => setDir((await api.pickFolder(dir)) ?? dir);

  const stage = job?.stage;
  const title = job ? (stage === "done" ? "Export finished" : stage === "error" ? "Export failed" : stage === "cancelled" ? "Export cancelled" : "Exporting audio") : "Export audio";
  const bytes = estimateBytes(text, s.config.speed, format, kbps);

  let body;
  let footer;
  if (job && exportRunning(job)) {
    body = <RenderingView job={job} />;
    footer = (
      <>
        <Button variant="danger" onClick={() => api.exportCancel(job.id)}>
          Cancel export
        </Button>
        <span style={{ flex: 1 }} />
        <Button variant="primary" onClick={onClose}>
          Run in background
        </Button>
      </>
    );
  } else if (job?.stage === "done") {
    body = <DoneView job={job} />;
    footer = (
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
    );
  } else if (job?.stage === "error" || job?.stage === "cancelled") {
    body =
      job.stage === "error" ? (
        <Banner tone="error" title="The export did not finish">
          {job.error}
        </Banner>
      ) : (
        <p className="sk-modal-text">The export was cancelled. No file was written.</p>
      );
    footer = (
      <>
        <Button onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={() => setJobId(null)}>
          Back to options
        </Button>
      </>
    );
  } else if (exists) {
    body = (
      <p className="sk-modal-text" data-testid="export-exists">
        A file named <b>{exists.path.split(/[\\/]/).pop()}</b> already exists in this folder.
      </p>
    );
    footer = (
      <>
        <Button
          onClick={() => {
            setExists(null);
            setTimeout(() => (document.getElementById("export-name") as HTMLInputElement | null)?.select(), 0);
          }}
        >
          Choose another name
        </Button>
        <span style={{ flex: 1 }} />
        <Button onClick={() => start("keep-both")}>Keep both</Button>
        <Button variant="danger" solid onClick={() => start("replace")}>
          Replace
        </Button>
      </>
    );
  } else {
    body = (
      <div className="sk-export">
        {error && (
          <Banner tone="error" title="Could not start the export">
            {error}
          </Banner>
        )}
        <label className="sk-field">
          <span>Text</span>
          <textarea className="sk-area" aria-label="Text to export" value={text} onChange={(e) => setText(e.target.value)} rows={5} />
        </label>
        <div className="sk-field">
          <span>Format</span>
          <div className="sk-row-actions">
            <Segmented
              label="Format"
              value={format}
              onChange={(v) => setFormat(v as "wav" | "mp3")}
              items={[
                { id: "mp3", label: "MP3" },
                { id: "wav", label: "WAV" },
              ]}
            />
            {format === "mp3" && (
              <Select size="sm" label="MP3 quality" value={String(kbps)} onChange={(v) => setKbps(Number(v))} options={MP3_KBPS.map((k) => ({ value: String(k), label: `${k} kbps` }))} />
            )}
          </div>
        </div>
        <div className="sk-field">
          <span>Voice</span>
          <Select size="sm" label="Voice" value={voice} onChange={setVoice} options={voices.length ? voices.map((v) => ({ value: v.id, label: v.name })) : [{ value: voice, label: voice }]} />
        </div>
        <label className="sk-field">
          <span>File name</span>
          <TextInput id="export-name" size="sm" aria-label="File name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="sk-field">
          <span>Folder</span>
          <div className="sk-row-actions">
            <code className="sk-path" title={dir}>
              {dir}
            </code>
            <Button size="sm" iconLeft="folder" onClick={browse}>
              Browse
            </Button>
          </div>
        </div>
        <p className="sk-modal-text" data-testid="export-estimate">
          About {formatBytes(bytes)} at {s.config.speed.toFixed(2)}x. The real size is known when it is done.
        </p>
      </div>
    );
    footer = (
      <>
        <Button onClick={onClose}>Cancel</Button>
        <span style={{ flex: 1 }} />
        <Button variant="primary" iconLeft="download" disabled={!text.trim() || !name.trim()} onClick={() => start()}>
          Export
        </Button>
      </>
    );
  }
  return (
    <Modal open onClose={onClose} title={title} width={560} footer={footer}>
      {body}
    </Modal>
  );
}

function RenderingView({ job }: { job: ExportView }) {
  return (
    <div data-testid="export-progress" data-stage={job.stage}>
      <p className="sk-modal-text">
        {job.stage === "rendering" ? `Rendering sentence ${Math.min(job.done + 1, job.total)} of ${job.total}` : job.stage === "encoding" ? "Encoding the MP3" : "Saving the file"}
      </p>
      <ProgressBar value={Math.round(job.progress * 100)} label={`Export of ${job.name}`} />
      <p className="sk-modal-text">You can close this window; the export keeps running and you get a notification when it is done.</p>
    </div>
  );
}

function DoneView({ job }: { job: ExportView }) {
  const [copied, setCopied] = useState(false);
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
        <Button
          size="sm"
          iconLeft="copy"
          onClick={async () => {
            await api.copy(job.path!);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/** Sidebar pill while exports run in the background (J6). */
export function ExportPill({ s, onOpen }: { s: AppState; onOpen(jobId: string): void }) {
  const running = s.exports.filter(exportRunning);
  if (!running.length) return null;
  return (
    <div className="sk-exportpill" data-testid="export-pill">
      {running.map((e) => (
        <button key={e.id} type="button" className="sk-exportpill__row" onClick={() => onOpen(e.id)} aria-label={`Exporting ${e.name}, ${Math.round(e.progress * 100)}%`}>
          <span>{e.name}</span>
          <ProgressBar thin value={Math.round(e.progress * 100)} label={`Export of ${e.name}`} />
        </button>
      ))}
    </div>
  );
}
