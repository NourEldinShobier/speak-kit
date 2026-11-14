import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Button, SettingRow, SettingsSection } from "@speakkit/ui";
import type { StorageInfo } from "../../../shared/ipc";
import { api, cleanError, formatBytes, Page } from "../../ui";
import { DeleteDownloadsDialog, type DeletePhase } from "./DeleteDownloadsDialog";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";
import type { Translator } from "../../i18n";

// Transcript settings load with the transcripts feature, which is rarely needed.
const TranscriptSettings = lazy(() => import("../transcripts").then((m) => ({ default: m.TranscriptSettings })));

const share = (n: number, total: number) => (total ? `${(n / total) * 100}%` : "0%");

function usageRows(st: StorageInfo, t: Translator["t"]): [string, number, string][] {
  return [
    [t("s.store.voice"), st.modelsBytes, "var(--tag-blue)"],
    [t("s.store.ocr"), st.cacheBytes, "var(--tag-yellow)"],
    [t("s.store.logs"), st.logsBytes, "var(--tag-orange)"],
    [t("s.store.other"), st.otherBytes, "var(--tag-purple)"],
  ];
}

function useDeleteFlow(reload: () => void) {
  const [phase, setPhase] = useState<DeletePhase>({ step: "closed" });
  const remove = () => {
    setPhase({ step: "working" });
    api
      .deleteDownloads()
      .then(
        (report) => setPhase({ step: "done", report }),
        (e) => setPhase({ step: "failed", message: cleanError(e) }),
      )
      .finally(reload);
  };
  return { phase, setPhase, remove };
}

function UsageRows({ rows, total }: { rows: [string, number, string][]; total: number }) {
  return (
    <>
      <div className="sk-pad" data-testid="storage-bar">
        <div className="sk-bar">
          {rows.map(([k, n]) => (
            <i key={k} style={{ width: share(n, total) }} />
          ))}
        </div>
      </div>
      {rows.map(([k, n, color]) => (
        <SettingRow
          key={k}
          label={
            <>
              <span className="sk-sw" style={{ background: color }} />
              {k}
            </>
          }
          control={<span>{formatBytes(n)}</span>}
        />
      ))}
    </>
  );
}

export function StoragePage() {
  const { t } = useT();
  const [st, setSt] = useState<StorageInfo | null>(null);
  const load = useCallback(() => api.storage().then(setSt, () => {}), []);
  useEffect(() => void load(), [load]);
  const { phase, setPhase, remove } = useDeleteFlow(load);
  const total = st ? st.modelsBytes + st.cacheBytes + st.logsBytes + st.otherBytes : 0;
  const rows = st ? usageRows(st, t) : [];
  return (
    <Page title={t("s.store.title")} lead={st ? t("s.store.lead", { size: formatBytes(total) }) : t("s.store.measuring")}>
      <SettingsSection title={t("s.store.folder")} description={st?.modelsDir}>
        <UsageRows rows={rows} total={total} />
        <SettingRow
          className="lm-row--control"
          label={t("s.store.openFolder")}
          control={
            <div className="sk-row-actions">
              <Button iconLeft="folder" onClick={() => api.openPath("models")}>
                {t("s.store.models")}
              </Button>
              <Button iconLeft="folder" onClick={() => api.openPath("logs")}>
                {t("s.store.logs")}
              </Button>
            </div>
          }
        />
        <SettingRow
          className="lm-row--control"
          label={t("s.store.deleteModels")}
          description={t("s.store.deleteHint")}
          control={
            <Button variant="danger" iconLeft="trash" disabled={!st} onClick={() => setPhase({ step: "confirm" })}>
              {t("s.store.delete")}
            </Button>
          }
        />
      </SettingsSection>
      <Suspense fallback={null}>
        <TranscriptSettings />
      </Suspense>
      {st ? <DeleteDownloadsDialog phase={phase} storage={st} onConfirm={remove} onClose={() => setPhase({ step: "closed" })} /> : null}
    </Page>
  );
}
