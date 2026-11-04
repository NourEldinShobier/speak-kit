import { useCallback, useEffect, useState } from "react";
import { Button, SettingRow, SettingsSection } from "@speakkit/ui";
import type { StorageInfo } from "../../../shared/ipc";
import { api, cleanError, formatBytes, Page } from "../../ui";
import { DeleteDownloadsDialog, type DeletePhase } from "./DeleteDownloadsDialog";

const share = (n: number, total: number) => (total ? `${(n / total) * 100}%` : "0%");

function usageRows(st: StorageInfo): [string, number, string][] {
  return [
    ["Voice models", st.modelsBytes, "var(--tag-blue)"],
    ["Optional engines", st.enginesBytes, "var(--tag-green)"],
    ["OCR data and exports", st.cacheBytes, "var(--tag-yellow)"],
    ["Logs", st.logsBytes, "var(--tag-orange)"],
    ["Settings and token", st.otherBytes, "var(--tag-purple)"],
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

export function StoragePage() {
  const [st, setSt] = useState<StorageInfo | null>(null);
  const load = useCallback(() => api.storage().then(setSt, () => {}), []);
  useEffect(() => void load(), [load]);
  const { phase, setPhase, remove } = useDeleteFlow(load);
  const total = st ? st.modelsBytes + st.enginesBytes + st.cacheBytes + st.logsBytes + st.otherBytes : 0;
  const rows = st ? usageRows(st) : [];
  return (
    <Page title="Storage" lead={st ? `On this computer: ${formatBytes(total)}` : "Measuring..."}>
      <SettingsSection title="Models folder" description={st?.modelsDir}>
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
        <SettingRow
          label="Open folder"
          control={
            <div className="sk-row-actions">
              <Button size="sm" iconLeft="folder" onClick={() => api.openPath("models")}>
                Models
              </Button>
              <Button size="sm" iconLeft="folder" onClick={() => api.openPath("logs")}>
                Logs
              </Button>
            </div>
          }
        />
        <SettingRow
          label="Delete downloaded models and engines"
          description="Frees the space. Your library, cloned voices and settings stay."
          control={
            <Button size="sm" variant="danger" iconLeft="trash" disabled={!st} onClick={() => setPhase({ step: "confirm" })}>
              Delete...
            </Button>
          }
        />
      </SettingsSection>
      {st ? <DeleteDownloadsDialog phase={phase} storage={st} onConfirm={remove} onClose={() => setPhase({ step: "closed" })} /> : null}
    </Page>
  );
}
