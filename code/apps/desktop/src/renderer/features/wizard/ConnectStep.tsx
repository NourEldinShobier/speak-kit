import { useState } from "react";
import { Button, LoadingLabel, SettingRow, SettingsSection, StatusPill } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { InstallExtension } from "../../pages";
import { api, TokenField } from "../../ui";
import { Back, Foot, Frame } from "./Frame";
import { connectPhase, type ConnectPhase } from "./model";

const LABELS: Record<ConnectPhase, string> = { idle: "Check that the extension reaches this app", waiting: "Waiting for the extension's first call", connected: "Connected" };

function TestControl({ phase, onStart }: { phase: ConnectPhase; onStart(): void }) {
  if (phase === "connected") {
    return (
      <StatusPill tone="green" icon="circle-check">
        Connected
      </StatusPill>
    );
  }
  if (phase === "waiting") return <LoadingLabel>Waiting</LoadingLabel>;
  return <Button onClick={onStart}>Test connection</Button>;
}

interface ConnectProps {
  s: AppState;
  copied: boolean;
  onCopied(): void;
  onBack(): void;
  onSkip(): void;
  onNext(): void;
}

export function ConnectStep({ s, copied, onCopied, onBack, onSkip, onNext }: ConnectProps) {
  const [testStart, setTestStart] = useState<number | null>(null);
  const phase = connectPhase(testStart, s.pairing.lastSeenMs);
  const paired = !!s.pairing.lastSeenMs;
  return (
    <Frame
      at={3}
      title="Connect your browser"
      sub="Install the extension, paste the token, then test the connection."
      foot={
        <Foot back={<Back onClick={onBack} />}>
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button variant="primary" size="lg" iconRight="arrow-right" disabled={!(copied || paired)} onClick={onNext}>
            Continue
          </Button>
        </Foot>
      }
    >
      <SettingsSection title="1. Install the extension" description="Add Speak Kit from the Chrome Web Store. It also installs in Edge and Brave. Then pin it from the puzzle menu.">
        <SettingRow
          label="Speak Kit for Chrome"
          control={
            <div className="sk-row-actions">
              <Button iconLeft="external-link" onClick={() => api.openExternal("webstore")}>
                Open Web Store
              </Button>
              <InstallExtension />
            </div>
          }
        />
      </SettingsSection>
      <SettingsSection title="2. Pair it with this app" description="Copy the token and paste it in the extension under Options > General > Pairing token.">
        <div className="sk-pad">
          <TokenField token={s.token} regenerate confirmRegenerate onCopied={onCopied} />
        </div>
      </SettingsSection>
      <SettingsSection title="3. Test the connection">
        <SettingRow
          label={LABELS[phase]}
          description={`Listening on 127.0.0.1:${s.port || "?"}. If Windows asks about the firewall, choose Private networks or Cancel; Speak Kit only listens on 127.0.0.1.`}
          control={<TestControl phase={phase} onStart={() => setTestStart(Date.now())} />}
        />
      </SettingsSection>
    </Frame>
  );
}
