import { useState } from "react";
import { Banner, Button, ProgressBar } from "@speakkit/ui";
import type { ExportView } from "../../../shared/export";
import "../../../shared/i18n/packs/export";
import type { TFn } from "../../../shared/i18n";
import { api, formatBytes } from "../../ui";
import { useT } from "../../i18n";
import { errorText } from "../../error-text";
import type { ExportAction } from "./model";

function RenderingBody({ job }: { job: ExportView }) {
  const { t } = useT();
  const text =
    job.stage === "rendering" ? t("export.stage.rendering", { n: Math.min(job.done + 1, job.total), total: job.total }) : t(job.stage === "encoding" ? "export.stage.encoding" : "export.stage.saving");
  return (
    <div className="sk-export__job" data-testid="export-progress" data-stage={job.stage}>
      <p className="sk-modal-text">{text}</p>
      <ul className="sk-export__files" aria-label={t("export.filesWritten")}>
        <li>{job.name}</li>
        {job.captions ? <li data-testid="export-plan-captions">{t("export.captionsItem", { name: `${job.name.replace(/\.[^.]+$/, "")}.${job.captions}` })}</li> : null}
        {job.chapters ? <li data-testid="export-plan-chapters">{t("export.chaptersItem")}</li> : null}
      </ul>
      <ProgressBar block className="sk-export__bar" value={Math.round(job.progress * 100)} label={t("export.barLabel", { name: job.name })} />
      <p className="sk-modal-text">{t("export.background")}</p>
    </div>
  );
}

function DoneBody({ job }: { job: ExportView }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await api.copy(job.path!);
    setCopied(true);
  };
  return (
    <div data-testid="export-done">
      <p className="sk-modal-text">
        {job.name} · {formatBytes(job.bytes ?? 0)}
        {job.durationMs ? ` · ${t("export.seconds", { n: Math.round(job.durationMs / 1000) })}` : ""}
      </p>
      <ul className="sk-export__files" aria-label={t("export.filesSaved")}>
        <li>{job.chapterCount ? t("export.withChapters", { name: job.name, n: job.chapterCount }) : job.name}</li>
        {job.captionsPath ? <li data-testid="export-captions">{t("export.withCaptions", { name: job.captionsPath.split(/[/\\]/).pop() ?? "", n: job.captionCount ?? 0 })}</li> : null}
      </ul>
      <div className="sk-row-actions">
        <code className="sk-path" title={job.path}>
          {job.path}
        </code>
        <Button iconLeft="copy" onClick={copy}>
          {copied ? t("export.copied") : t("export.copy")}
        </Button>
      </div>
    </div>
  );
}

interface JobProps {
  job: ExportView;
  onClose(): void;
  dispatch(a: ExportAction): void;
  t: TFn;
}

export function renderingView({ job, onClose, t }: JobProps) {
  return {
    body: <RenderingBody job={job} />,
    footer: (
      <>
        <Button variant="danger" onClick={() => api.exportCancel(job.id)}>
          {t("export.cancelExport")}
        </Button>
        <span style={{ flex: 1 }} />
        <Button variant="primary" onClick={onClose}>
          {t("export.runInBackground")}
        </Button>
      </>
    ),
  };
}

export function doneView({ job, onClose, t }: JobProps) {
  return {
    body: <DoneBody job={job} />,
    footer: (
      <>
        <Button iconLeft="folder" onClick={() => api.exportReveal(job.path!, false)}>
          {t("export.showFolder")}
        </Button>
        <span style={{ flex: 1 }} />
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button variant="primary" iconLeft="player-play" onClick={() => api.exportReveal(job.path!, true)}>
          {t("export.openFile")}
        </Button>
      </>
    ),
  };
}

export function endedView({ job, onClose, dispatch, t }: JobProps) {
  const body =
    job.stage === "error" ? (
      <Banner tone="error" title={t("export.failedTitle")}>
        {job.error && errorText(job.error)}
      </Banner>
    ) : (
      <p className="sk-modal-text">{t("export.cancelledBody")}</p>
    );
  const footer = (
    <>
      <Button onClick={onClose}>{t("common.close")}</Button>
      <Button variant="primary" onClick={() => dispatch({ type: "back-to-options" })}>
        {t("export.backToOptions")}
      </Button>
    </>
  );
  return { body, footer };
}
