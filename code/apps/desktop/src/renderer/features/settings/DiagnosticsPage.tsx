import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Modal, Segmented, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { engineView } from "../../../shared/engine-view";
import { ACTIVITY_FILTERS, activityRow, filterActivity, type ActivityFilter } from "../../../shared/settings/diagnostics";
import { api, Page, useVisible } from "../../ui";
import { rowAttr } from "./focus";
import { change } from "../../change";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";
import { at } from "../../../shared/i18n";

function listenerText(s: AppState): string {
  if (s.serverError) return at("s.diag.notRunning");
  return s.port ? at("s.diag.port", { port: String(s.port) }) : at("s.diag.starting");
}

function logText(log: string[] | null): string {
  if (log === null) return at("s.diag.logLoading");
  return log.length ? log.join("\n") : at("s.diag.logEmpty");
}

/** The log tail. It asks main every 3 s while the window is visible and redraws only when the file grew. */
function useLog(): string[] | null {
  const visible = useVisible();
  const [lines, setLines] = useState<string[] | null>(null);
  const size = useRef(0);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    const tick = () =>
      api.diagnosticsLog(size.current).then(
        (r) => {
          if (!live) return;
          size.current = r.size;
          if (r.lines) setLines(r.lines);
        },
        () => live && setLines((l) => l ?? []),
      );
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [visible]);
  return lines;
}

function PreviewDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useT();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    setText(null);
    setFailed(false);
    setCopied(false);
    api.diagnosticsReport().then(setText, () => setFailed(true));
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("s.diag.previewTitle")}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>{t("common.close")}</Button>
          <Button
            variant="primary"
            disabled={text === null}
            onClick={() => {
              if (text !== null) void api.copy(text).then(() => setCopied(true));
            }}
          >
            {t(copied ? "common.copied" : "common.copy")}
          </Button>
        </>
      }
    >
      <p className="sk-modal-text">{t("s.diag.previewBody")}</p>
      {failed ? (
        <p role="alert">{t("s.diag.previewFailed")}</p>
      ) : (
        <pre className="sk-report" tabIndex={0} aria-label={t("s.diag.reportAria")}>
          {text ?? t("s.diag.building")}
        </pre>
      )}
    </Modal>
  );
}

function ClearDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("s.diag.clearTitle")}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            variant="danger"
            onClick={() => {
              onClose();
              void api.clearActivity();
            }}
          >
            {t("s.diag.clear")}
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {t("s.diag.clearBody")}
      </p>
    </Modal>
  );
}

function ActivityList({ rows }: { rows: AppState["activity"] }) {
  const { t, locale } = useT();
  return (
    <ul className="sk-activity" aria-label={t("s.diag.activity")}>
      {rows.map((a) => {
        const r = activityRow(a);
        return (
          <li key={a.id} data-kind={a.kind}>
            <b>{r.title}</b>
            <span>{r.detail}</span>
            <time dateTime={new Date(a.atMs).toISOString()}>{new Date(a.atMs).toLocaleTimeString(locale)}</time>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityLog({ s }: { s: AppState }) {
  const { t, label } = useT();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [ask, setAsk] = useState(false);
  const rows = filterActivity(s.activity, filter);
  const none = s.activity.length === 0;
  return (
    <SettingsSection title={t("s.diag.activity")} description={t("s.diag.activityLead")}>
      <div {...rowAttr("diagnostics/activity")} className="sk-pad sk-activity__bar">
        <Segmented
          label={t("s.diag.show")}
          items={ACTIVITY_FILTERS.map((f) => ({ id: f.id, label: label(`s.diag.filter.${f.id}`, f.label) }))}
          value={filter}
          onChange={(v) => setFilter(v as ActivityFilter)}
        />
        <Button variant="danger" disabled={none} onClick={() => setAsk(true)}>
          {t("s.diag.clear")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="history" title={t(none ? "s.diag.nothing" : "s.diag.nothingView")}>
          {t(none ? "s.diag.emptyHint" : "s.diag.otherFilter")}
        </EmptyState>
      ) : (
        <ActivityList rows={rows} />
      )}
      <ClearDialog open={ask} onClose={() => setAsk(false)} />
    </SettingsSection>
  );
}

export function DiagnosticsPage({ s }: { s: AppState }) {
  const { t } = useT();
  const [preview, setPreview] = useState(false);
  const log = useLog();
  const v = engineView(s.health, s.serverError);
  return (
    <Page
      title={t("s.diag.title")}
      lead={t("s.diag.lead")}
      action={
        <Button variant="primary" iconLeft="copy" onClick={() => setPreview(true)}>
          {t("s.diag.copy")}
        </Button>
      }
    >
      <SettingsSection title={t("s.diag.computer")}>
        <SettingRow label={t("s.diag.listener")} description={t("s.diag.listenerHint")} control={<span data-testid="diag-listener">{listenerText(s)}</span>} />
        <SettingRow label={t("s.about.engine")} control={<span>{v.label}</span>} />
        <SettingRow label={t("s.diag.processor")} control={<span>{t("s.diag.cores", { n: navigator.hardwareConcurrency })}</span>} />
        <SettingRow
          label={t("s.diag.logFolder")}
          description={t("s.diag.logFolderHint")}
          control={
            <Button iconLeft="folder" onClick={() => api.openPath("logs")}>
              {t("s.about.openLogs")}
            </Button>
          }
        />
        <SettingRow label={t("s.diag.runSetup")} description={t("s.diag.runSetupHint")} control={<Button onClick={() => change({ setupDone: false })}>{t("s.diag.runSetupBtn")}</Button>} />
      </SettingsSection>
      <ActivityLog s={s} />
      <SettingsSection title={t("s.diag.log")}>
        <pre className="sk-report sk-report--log" tabIndex={0} aria-label={t("s.diag.logAria")} data-testid="log-view">
          {logText(log)}
        </pre>
      </SettingsSection>
      <PreviewDialog open={preview} onClose={() => setPreview(false)} />
    </Page>
  );
}
