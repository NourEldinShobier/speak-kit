import { Banner, Button, Checkbox, Select, TextInput } from "@speakkit/ui";
import { estimateBytes, headingsOf, type ExportCaptions, type ExportConflict, type ExportTarget } from "../../../shared/export";
import type { AppState } from "../../../shared/ipc";
import { MP3_KBPS } from "../../../shared/schemas";
import { api, formatBytes } from "../../ui";
import type { ExportAction, ExportState } from "./model";

export interface ViewProps {
  s: AppState;
  st: ExportState;
  dispatch(a: ExportAction): void;
  onClose(): void;
  start(conflict?: ExportConflict): void;
}

function FormatField({ st, dispatch }: Pick<ViewProps, "st" | "dispatch">) {
  const { format, kbps } = st.form;
  return (
    <div className="sk-field">
      <span>Format</span>
      <div className="sk-row-actions">
        <Select
          label="Format"
          value={format}
          onChange={(v) => dispatch({ type: "edit", patch: { format: v as "wav" | "mp3" } })}
          options={[
            { value: "mp3", label: "MP3" },
            { value: "wav", label: "WAV" },
          ]}
        />
        {format === "mp3" && (
          <Select
            label="MP3 quality"
            value={String(kbps)}
            onChange={(v) => dispatch({ type: "edit", patch: { kbps: Number(v) } })}
            options={MP3_KBPS.map((k) => ({ value: String(k), label: `${k} kbps` }))}
          />
        )}
      </div>
    </div>
  );
}

export const CAPTION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "srt", label: "SRT (subtitles for most video players)" },
  { value: "vtt", label: "WebVTT (subtitles for web players)" },
];

/** Captions and chapter markers: both off by default. WAV cannot hold chapters, and the line says so. */
function ExtrasFields({ st, dispatch }: Pick<ViewProps, "st" | "dispatch">) {
  const { format, captions, chapters, text } = st.form;
  const headings = headingsOf(text).length;
  const wav = format === "wav";
  return (
    <>
      <div className="sk-field">
        <span>Captions</span>
        <Select label="Captions" value={captions} onChange={(v) => dispatch({ type: "edit", patch: { captions: v as ExportCaptions } })} options={CAPTION_OPTIONS} />
      </div>
      <div className="sk-field">
        <span>Chapters</span>
        <div className="sk-export__chapters">
          <Checkbox label="Add chapter markers" checked={!wav && chapters} disabled={wav} onChange={(e) => dispatch({ type: "edit", patch: { chapters: e.target.checked } })} />
          <span className="sk-modal-text" data-testid="chapters-note">
            {wav
              ? "WAV files cannot hold chapter markers. Captions still work."
              : headings
                ? `${headings} ${headings === 1 ? "heading" : "headings"} found in the text.`
                : "No headings found. A heading is a line that starts with #."}
          </span>
        </div>
      </div>
    </>
  );
}

function FolderField({ st, dispatch }: Pick<ViewProps, "st" | "dispatch">) {
  const { dir } = st.form;
  const browse = async () => dispatch({ type: "edit", patch: { dir: (await api.pickFolder(dir)) ?? dir } });
  return (
    <div className="sk-field">
      <span>Folder</span>
      <div className="sk-row-actions">
        <code className="sk-path" title={dir}>
          {dir}
        </code>
        <Button iconLeft="folder" onClick={browse}>
          Browse
        </Button>
      </div>
    </div>
  );
}

function OptionsBody({ s, st, dispatch }: Pick<ViewProps, "s" | "st" | "dispatch">) {
  const { text, name, voice, format, kbps } = st.form;
  const edit = (patch: Partial<typeof st.form>) => dispatch({ type: "edit", patch });
  const voiceOptions = st.voices.length ? st.voices.map((v) => ({ value: v.id, label: v.name })) : [{ value: voice, label: voice }];
  return (
    <div className="sk-export">
      {st.error && (
        <Banner tone="error" title="Could not start the export">
          {st.error}
        </Banner>
      )}
      <label className="sk-field">
        <span>Text</span>
        <textarea className="sk-area" aria-label="Text to export" value={text} onChange={(e) => edit({ text: e.target.value })} rows={5} />
      </label>
      <FormatField st={st} dispatch={dispatch} />
      <ExtrasFields st={st} dispatch={dispatch} />
      <div className="sk-field">
        <span>Voice</span>
        <Select label="Voice" value={voice} onChange={(v) => edit({ voice: v })} options={voiceOptions} />
      </div>
      <label className="sk-field">
        <span>File name</span>
        <TextInput id="export-name" aria-label="File name" value={name} onChange={(e) => edit({ name: e.target.value })} />
      </label>
      <FolderField st={st} dispatch={dispatch} />
      <p className="sk-modal-text" data-testid="export-estimate">
        About {formatBytes(estimateBytes(text, s.config.speed, format, kbps))} at {s.config.speed.toFixed(2)}x. The real size is known when it is done.
      </p>
    </div>
  );
}

export function optionsView(p: ViewProps) {
  const { text, name } = p.st.form;
  const footer = (
    <>
      <Button onClick={p.onClose}>Cancel</Button>
      <span style={{ flex: 1 }} />
      <Button variant="primary" iconLeft="download" disabled={!text.trim() || !name.trim()} onClick={() => p.start()}>
        Export
      </Button>
    </>
  );
  return { body: <OptionsBody s={p.s} st={p.st} dispatch={p.dispatch} />, footer };
}

export function existsView(p: Pick<ViewProps, "dispatch" | "start"> & { target: ExportTarget }) {
  const rename = () => {
    p.dispatch({ type: "rename" });
    setTimeout(() => (document.getElementById("export-name") as HTMLInputElement | null)?.select(), 0);
  };
  const body = (
    <p className="sk-modal-text" data-testid="export-exists">
      A file named <b>{p.target.path.split(/[\\/]/).pop()}</b> already exists in this folder.
    </p>
  );
  const footer = (
    <>
      <Button onClick={rename}>Choose another name</Button>
      <span style={{ flex: 1 }} />
      <Button onClick={() => p.start("keep-both")}>Keep both</Button>
      <Button variant="danger" onClick={() => p.start("replace")}>
        Replace
      </Button>
    </>
  );
  return { body, footer };
}
