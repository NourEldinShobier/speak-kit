import type { ReactNode } from "react";
import { Banner, Button, ProgressBar, SettingRow, SettingsSection, StatusPill } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { api } from "../../ui";
import { Back, Foot, Frame } from "./Frame";
import { DOWNLOAD_TITLES, downloadSub, downloadView, MODEL_MB, type DownloadPhase } from "./model";

const PILLS: Record<DownloadPhase, (s: AppState, pct: number) => ReactNode> = {
  failed: () => (
    <StatusPill tone="orange" icon="alert-triangle">
      Paused
    </StatusPill>
  ),
  ready: () => (
    <StatusPill tone="green" icon="circle-check">
      Done
    </StatusPill>
  ),
  downloading: (s, pct) => (
    <StatusPill tone="blue" icon="loader-2">
      {s.health?.engine.state === "loading" ? "Loading" : `${Math.round(pct * 100)}%`}
    </StatusPill>
  ),
};

function DownloadAction({ phase, onNext }: { phase: DownloadPhase; onNext(): void }) {
  if (phase === "failed") {
    return (
      <Button variant="primary" size="lg" iconLeft="refresh" onClick={() => api.retryEngine()}>
        Retry download
      </Button>
    );
  }
  return (
    <Button variant="primary" size="lg" iconRight="arrow-right" onClick={onNext}>
      {phase === "ready" ? "Continue" : "Continue in background"}
    </Button>
  );
}

export function DownloadStep({ s, onBack, onNext }: { s: AppState; onBack(): void; onNext(): void }) {
  const v = downloadView(s);
  const description = v.phase === "ready" ? `${MODEL_MB} MB, done` : `${Math.round(v.pct * MODEL_MB)} MB of ${MODEL_MB} MB`;
  return (
    <Frame
      at={2}
      title={DOWNLOAD_TITLES[v.phase]}
      sub={downloadSub(v)}
      foot={
        <Foot back={<Back label="Cancel" onClick={onBack} />}>
          <DownloadAction phase={v.phase} onNext={onNext} />
        </Foot>
      }
    >
      <div data-testid="download">
        <SettingsSection title="Model">
          <SettingRow label="kokoro-82m (q8)" description={description} control={PILLS[v.phase](s, v.pct)} />
          <div style={{ padding: "0 14px 14px" }}>
            <ProgressBar value={v.pct * 100} label="Download progress" />
          </div>
        </SettingsSection>
      </div>
      {v.phase === "failed" && (
        <Banner tone="warning" title="Lost the connection to the model server">
          Check your internet connection, then retry. Downloading resumes where it stopped.
          {v.detail && (
            <>
              {" "}
              Details: <code>{v.detail}</code>
            </>
          )}
        </Banner>
      )}
      {v.phase === "downloading" && <p style={{ margin: 0, color: "var(--text-secondary)" }}>Continue in the background to set up your browser now. The download finishes on its own.</p>}
    </Frame>
  );
}
