import { useState } from "react";
import { Banner, Button, SettingRow, SettingsSection, StatusPill, TextInput } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { api, cleanError, Page, TokenField } from "../../ui";

/** The port field with its Apply button; the message of a refused port stays under the field. */
function PortRow({ s }: { s: AppState }) {
  const [port, setPort] = useState(String(s.config.preferredPort));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(port);
  const valid = Number.isInteger(n) && n >= 1024 && n <= 65535;
  const apply = async () => {
    setBusy(true);
    try {
      await api.setPort(n);
      setErr("");
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingRow
      className="lm-row--control"
      label="Server port"
      description="The extension connects here. Default 47615. If it is busy, the next free port is used."
      control={
        <div className="sk-row-actions">
          <TextInput aria-label="Server port" inputMode="numeric" value={port} error={!valid ? "1024 to 65535" : err || undefined} onChange={(e) => setPort(e.target.value)} style={{ width: 96 }} />
          <Button disabled={!valid || busy || n === s.config.preferredPort} loading={busy} onClick={apply}>
            Apply
          </Button>
        </div>
      }
    />
  );
}

export function BrowserPage({ s }: { s: AppState }) {
  const lastSeen = s.pairing.lastSeenMs;
  return (
    <Page title="Browser integration" lead="How the extension finds and trusts this app.">
      {s.portFallback && (
        <Banner tone="warning" title={`Port ${s.config.preferredPort} is busy`}>
          Using {s.port} for now. Enter {s.port} in the extension.
        </Banner>
      )}
      <SettingsSection title="Connection">
        <PortRow s={s} />
        <SettingRow
          label="Paired browser"
          description={lastSeen ? `Last call ${new Date(lastSeen).toLocaleTimeString()}` : "No extension has called yet."}
          control={<StatusPill tone={lastSeen ? "green" : "neutral"}>{lastSeen ? "Connected" : "Waiting"}</StatusPill>}
        />
      </SettingsSection>
      <SettingsSection title="Pairing token" description="Regenerating signs out every paired browser.">
        <div className="sk-pad">
          <TokenField token={s.token} regenerate confirmRegenerate />
        </div>
      </SettingsSection>
    </Page>
  );
}
