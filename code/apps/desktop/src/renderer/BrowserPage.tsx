import { Banner, Button, SettingRow, StatusPill } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { InstallExtension } from "./pages";
import { api, Page, TokenField } from "./ui";

function PairSteps({ token }: { token: string }) {
  return (
    <div className="sk-accent-card">
      <h3>Pair your browser</h3>
      <ol className="sk-steps">
        <li>
          <b>Install</b> Speak Kit from the Chrome Web Store, then pin it from the puzzle menu.
        </li>
        <li>
          <b>Copy</b> the token below.
        </li>
        <li>
          <b>Paste</b> it in the extension under Options &gt; General &gt; Pairing token.
        </li>
      </ol>
      <TokenField token={token} regenerate confirmRegenerate />
      <div className="sk-row-actions">
        <Button iconLeft="external-link" onClick={() => api.openExternal("webstore")}>
          Open Web Store
        </Button>
        <InstallExtension />
      </div>
    </div>
  );
}

function lastCall(s: AppState): string {
  if (!s.pairing.lastSeenMs) return "No call from an extension yet. It appears here after the first request.";
  return `Last call ${new Date(s.pairing.lastSeenMs).toLocaleTimeString()}${s.pairing.origin ? `, ${s.pairing.origin}` : ""}`;
}

export function BrowserPage({ s }: { s: AppState }) {
  const paired = !!s.pairing.lastSeenMs;
  return (
    <Page title="Browser" lead="Connect Chrome, Edge or Brave to the voice engine on this computer." wide>
      <PairSteps token={s.token} />
      <div>
        <p className="sk-caps">Paired</p>
        <div className="lm-card">
          <SettingRow
            label="Chrome extension"
            description={lastCall(s)}
            control={
              <StatusPill tone={paired ? "green" : "neutral"} icon={paired ? "circle-check" : undefined}>
                {paired ? "Connected" : "Waiting"}
              </StatusPill>
            }
          />
          <SettingRow label="Connection" description="Connected over this computer only (127.0.0.1)." control={<code>127.0.0.1:{s.port || "-"}</code>} />
        </div>
      </div>
      <Banner tone="info">Page text is treated as information, never as instructions. The token never leaves this computer.</Banner>
    </Page>
  );
}
