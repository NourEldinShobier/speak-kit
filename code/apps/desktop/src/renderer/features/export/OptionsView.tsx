import { Banner, Button, Checkbox, Select, TextInput } from "@speakkit/ui";
import { estimateBytes, headingsOf, type ExportCaptions, type ExportConflict, type ExportTarget } from "../../../shared/export";
import "../../../shared/i18n/packs/export";
import type { TFn } from "../../../shared/i18n";
import type { AppState } from "../../../shared/ipc";
import { MP3_KBPS } from "../../../shared/schemas";
import { Rich, useT } from "../../i18n";
import { api, formatBytes } from "../../ui";
import type { ExportAction, ExportState } from "./model";

export interface ViewProps {
  s: AppState;
  st: ExportState;
  dispatch(a: ExportAction): void;
  onClose(): void;
  start(conflict?: ExportConflict): void;
  t: TFn;
}

function FormatField({ st, dispatch }: Pick<ViewProps, "st" | "dispatch">) {
  const { t } = useT();
  const { format, kbps } = st.form;
  return (
    <div className="sk-field">
      <span>{t("export.format")}</span>
      <div className="sk-row-actions">
        <Select
          label={t("export.format")}
          value={format}
          onChange={(v) => dispatch({ type: "edit", patch: { format: v as "wav" | "mp3" } })}
          options={[
            { value: "mp3", label: "MP3" },
            { value: "wav", label: "WAV" },
          ]}
        />
        {format === "mp3" && (
          <Select
            label={t("export.quality")}
            value={String(kbps)}
            onChange={(v) => dispatch({ type: "edit", patch: { kbps: Number(v) } })}
            options={MP3_KBPS.map((k) => ({ value: String(k), label: t("export.kbps", { n: k }) }))}
          />
        )}
      </div>
    </div>
  );
}

const captionOptions = (t: TFn) => [
  { value: "none", label: t("export.captionsNone") },
  { value: "srt", label: t("export.captionsSrt") },
  { value: "vtt", label: t("export.captionsVtt") },
];

function chaptersNote(wav: boolean, headings: number, t: TFn): string {
  if (wav) return t("export.chaptersWav");
  if (!headings) return t("export.chaptersNone");
  return t("export.chaptersFound", { n: headings });
}

/** Captions and chapter markers: both off by default. WAV cannot hold chapters, and the line says so. */
function ExtrasFields({ st, dispatch }: Pick<ViewProps, "st" | "dispatch">) {
  const { t } = useT();
  const { format, captions, chapters, text } = st.form;
  const headings = headingsOf(text).length;
  const wav = format === "wav";
  return (
    <>
      <div className="sk-field">
        <span>{t("export.captions")}</span>
        <Select label={t("export.captions")} value={captions} onChange={(v) => dispatch({ type: "edit", patch: { captions: v as ExportCaptions } })} options={captionOptions(t)} />
      </div>
      <div className="sk-field">
        <span>{t("export.chapters")}</span>
        <div className="sk-export__chapters">
          <Checkbox label={t("export.addChapters")} checked={!wav && chapters} disabled={wav} onChange={(e) => dispatch({ type: "edit", patch: { chapters: e.target.checked } })} />
          <span className="sk-modal-text" data-testid="chapters-note">
            {chaptersNote(wav, headings, t)}
          </span>
        </div>
      </div>
    </>
  );
}

function FolderField({ st, dispatch }: Pick<ViewProps, "st" | "dispatch">) {
  const { t } = useT();
  const { dir } = st.form;
  const browse = async () => dispatch({ type: "edit", patch: { dir: (await api.pickFolder(dir)) ?? dir } });
  return (
    <div className="sk-field">
      <span>{t("export.folder")}</span>
      <div className="sk-row-actions">
        <code className="sk-path" title={dir}>
          {dir}
        </code>
        <Button iconLeft="folder" onClick={browse}>
          {t("export.browse")}
        </Button>
      </div>
    </div>
  );
}

function OptionsBody({ s, st, dispatch }: Pick<ViewProps, "s" | "st" | "dispatch">) {
  const { t } = useT();
  const { text, name, voice, format, kbps } = st.form;
  const edit = (patch: Partial<typeof st.form>) => dispatch({ type: "edit", patch });
  const voiceOptions = st.voices.length ? st.voices.map((v) => ({ value: v.id, label: v.name })) : [{ value: voice, label: voice }];
  return (
    <div className="sk-export">
      {st.error && (
        <Banner tone="error" title={t("export.startFailed")}>
          {st.error}
        </Banner>
      )}
      <label className="sk-field">
        <span>{t("export.text")}</span>
        <textarea className="sk-area" aria-label={t("export.textLabel")} value={text} onChange={(e) => edit({ text: e.target.value })} rows={5} />
      </label>
      <FormatField st={st} dispatch={dispatch} />
      <ExtrasFields st={st} dispatch={dispatch} />
      <div className="sk-field">
        <span>{t("export.voice")}</span>
        <Select label={t("export.voice")} value={voice} onChange={(v) => edit({ voice: v })} options={voiceOptions} />
      </div>
      <label className="sk-field">
        <span>{t("export.fileName")}</span>
        <TextInput id="export-name" aria-label={t("export.fileName")} value={name} onChange={(e) => edit({ name: e.target.value })} />
      </label>
      <FolderField st={st} dispatch={dispatch} />
      <p className="sk-modal-text" data-testid="export-estimate">
        {t("export.estimate", { size: formatBytes(estimateBytes(text, s.config.speed, format, kbps)), speed: s.config.speed.toFixed(2) })}
      </p>
    </div>
  );
}

export function optionsView(p: ViewProps) {
  const { text, name } = p.st.form;
  const footer = (
    <>
      <Button onClick={p.onClose}>{p.t("common.cancel")}</Button>
      <span style={{ flex: 1 }} />
      <Button variant="primary" iconLeft="download" disabled={!text.trim() || !name.trim()} onClick={() => p.start()}>
        {p.t("export.export")}
      </Button>
    </>
  );
  return { body: <OptionsBody s={p.s} st={p.st} dispatch={p.dispatch} />, footer };
}

export function existsView(p: Pick<ViewProps, "dispatch" | "start" | "t"> & { target: ExportTarget }) {
  const rename = () => {
    p.dispatch({ type: "rename" });
    setTimeout(() => (document.getElementById("export-name") as HTMLInputElement | null)?.select(), 0);
  };
  const body = (
    <p className="sk-modal-text" data-testid="export-exists">
      <Rich text={p.t("export.exists", { name: p.target.path.split(/[\\/]/).pop() ?? "" })} />
    </p>
  );
  const footer = (
    <>
      <Button onClick={rename}>{p.t("export.anotherName")}</Button>
      <span style={{ flex: 1 }} />
      <Button onClick={() => p.start("keep-both")}>{p.t("export.keepBoth")}</Button>
      <Button variant="danger" onClick={() => p.start("replace")}>
        {p.t("export.replace")}
      </Button>
    </>
  );
  return { body, footer };
}
