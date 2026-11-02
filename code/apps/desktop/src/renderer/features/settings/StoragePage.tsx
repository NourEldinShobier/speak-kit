import { useEffect, useState } from "react";
import { Button, SettingRow, SettingsSection } from "@speakkit/ui";
import type { StorageInfo } from "../../../shared/ipc";
import { api, formatBytes, Page } from "../../ui";

const share = (n: number, total: number) => (total ? `${(n / total) * 100}%` : "0%");

function usageRows(st: StorageInfo): [string, number, string][] {
  return [
    ["Voice models", st.modelsBytes, "var(--tag-blue)"],
    ["Logs", st.logsBytes, "var(--tag-orange)"],
    ["Settings and token", st.otherBytes, "var(--tag-purple)"],
  ];
}

export function StoragePage() {
  const [st, setSt] = useState<StorageInfo | null>(null);
  useEffect(() => {
    api.storage().then(setSt, () => {});
  }, []);
  const total = st ? st.modelsBytes + st.logsBytes + st.otherBytes : 0;
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
      </SettingsSection>
    </Page>
  );
}
