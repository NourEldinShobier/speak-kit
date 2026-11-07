import { Banner, Button } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { ModelDownloadCard } from "../../ModelDownloadCard";
import { api } from "../../ui";
import { Back, Foot, Frame } from "./Frame";
import { DOWNLOAD_TITLES, downloadSub, downloadView, MODEL_MB, type DownloadPhase } from "./model";

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
        <section className="lm-section">
          <header className="lm-section__head">
            <h3 className="lm-section__title">Model</h3>
          </header>
          <ModelDownloadCard name="kokoro-82m (q8)" pct={v.pct} totalMb={MODEL_MB} paused={v.phase === "failed"} />
        </section>
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
