import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Modal, Segmented, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { engineView } from "../../../shared/engine-view";
import { ACTIVITY_FILTERS, activityRow, filterActivity, type ActivityFilter } from "../../../shared/settings/diagnostics";
import { api, Page, useVisible } from "../../ui";
import { rowAttr } from "./focus";
import { change } from "../../change";

function listenerText(s: AppState): string {
  if (s.serverError) return "Not running";
  return s.port ? `Port ${s.port}` : "Starting";
}

function logText(log: string[] | null): string {
  if (log === null) return "Loading...";
  return log.length ? log.join("\n") : "The log is empty.";
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
      title="Diagnostics to copy"
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            disabled={text === null}
            onClick={() => {
              if (text !== null) void api.copy(text).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </>
      }
    >
      <p className="sk-modal-text">Paths, names, keys and e-mail addresses are removed. This is the text that will be copied.</p>
      {failed ? (
        <p role="alert">The report could not be built. Try again.</p>
      ) : (
        <pre className="sk-report" tabIndex={0} aria-label="Diagnostics text">
          {text ?? "Building..."}
        </pre>
      )}
    </Modal>
  );
}

function ClearDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Clear the activity log?"
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              onClose();
              void api.clearActivity();
            }}
          >
            Clear
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        The lines in this list and in the bell are removed. The log file on disk stays.
      </p>
    </Modal>
  );
}

function ActivityList({ rows }: { rows: AppState["activity"] }) {
  return (
    <ul className="sk-activity" aria-label="Activity log">
      {rows.map((a) => {
        const r = activityRow(a);
        return (
          <li key={a.id} data-kind={a.kind}>
            <b>{r.title}</b>
            <span>{r.detail}</span>
            <time dateTime={new Date(a.atMs).toISOString()}>{new Date(a.atMs).toLocaleTimeString()}</time>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityLog({ s }: { s: AppState }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [ask, setAsk] = useState(false);
  const rows = filterActivity(s.activity, filter);
  const none = s.activity.length === 0;
  return (
    <SettingsSection title="Activity log" description="What the app did that you may want to know about, newest first.">
      <div {...rowAttr("diagnostics/activity")} className="sk-pad sk-activity__bar">
        <Segmented label="Show" items={ACTIVITY_FILTERS.map((f) => ({ id: f.id, label: f.label }))} value={filter} onChange={(v) => setFilter(v as ActivityFilter)} />
        <Button variant="danger" disabled={none} onClick={() => setAsk(true)}>
          Clear
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="history" title={none ? "Nothing logged yet" : "Nothing in this view"}>
          {none ? "Problems, exports and updates show up here." : "Try another filter."}
        </EmptyState>
      ) : (
        <ActivityList rows={rows} />
      )}
      <ClearDialog open={ask} onClose={() => setAsk(false)} />
    </SettingsSection>
  );
}

export function DiagnosticsPage({ s }: { s: AppState }) {
  const [preview, setPreview] = useState(false);
  const log = useLog();
  const v = engineView(s.health, s.serverError);
  return (
    <Page
      title="Diagnostics"
      lead="Logs and checks for when something goes wrong."
      action={
        <Button variant="primary" iconLeft="copy" onClick={() => setPreview(true)}>
          Copy diagnostics
        </Button>
      }
    >
      <SettingsSection title="This computer">
        <SettingRow label="Listener" description="The local server the browser extension talks to." control={<span data-testid="diag-listener">{listenerText(s)}</span>} />
        <SettingRow label="Voice engine" control={<span>{v.label}</span>} />
        <SettingRow label="Processor" control={<span>{navigator.hardwareConcurrency} cores</span>} />
        <SettingRow
          label="Log folder"
          description="Logs are kept in JSON lines and have secrets removed."
          control={
            <Button iconLeft="folder" onClick={() => api.openPath("logs")}>
              Open log folder
            </Button>
          }
        />
        <SettingRow label="Run setup again" description="Go through the first-run steps once more." control={<Button onClick={() => change({ setupDone: false })}>Run setup</Button>} />
      </SettingsSection>
      <ActivityLog s={s} />
      <SettingsSection title="Log (last lines)">
        <pre className="sk-report sk-report--log" tabIndex={0} aria-label="Log lines" data-testid="log-view">
          {logText(log)}
        </pre>
      </SettingsSection>
      <PreviewDialog open={preview} onClose={() => setPreview(false)} />
    </Page>
  );
}
