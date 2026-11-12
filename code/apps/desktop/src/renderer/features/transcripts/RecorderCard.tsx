import { useState } from "react";
import { Banner, Button, IconButton } from "@speakkit/ui";
import type { Push } from "../../../shared/transcripts/contract";
import { transcripts } from "./api";
import { timerText } from "./model";

const BARS = 18;

/** Level bars: the first `level` share of them are lit. */
function Meter({ level, label }: { level: number; label: string }) {
  const lit = Math.round(level * BARS);
  return (
    <span className="tr-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      {Array.from({ length: BARS }, (_, i) => (
        <i key={i} data-lit={i < lit || undefined} style={{ blockSize: `${30 + ((i * 37) % 70)}%` }} />
      ))}
    </span>
  );
}

/** Record a conversation: the consent reminder, the microphone and Start recording; while recording, the timer, the level, the sound check and Stop and save. Microphone only: system audio belongs to meetings. */
export function RecorderCard({ push, onClose, onStarted }: { push: Push; onClose(): void; onStarted(): void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rec = push.recording;
  const starting = busy || rec?.phase === "starting";
  const saving = rec?.phase === "saving";
  const start = async () => {
    setError(null);
    setBusy(true);
    const r = await transcripts.recordStart().catch(() => null);
    setBusy(false);
    if (!r) setError("The recording could not be started.");
    else if (!r.ok) setError(r.failure.message);
    else onStarted();
  };
  const stop = async () => {
    const r = await transcripts.recordStop().catch(() => null);
    if (r && !r.ok) setError(r.failure.message);
  };
  if (rec && rec.phase !== "starting") {
    return (
      <section className="lm-card tr-rec" aria-label="Recording" data-testid="recorder">
        <div className="tr-rec__head">
          <span className="tr-rec__title">
            <span className="tr-rec__dot" data-saving={saving || undefined} aria-hidden="true" />
            <strong>{saving ? "Saving" : "Recording"}</strong>
            <span className="tr-rec__time" role="timer" aria-label="Recording time">
              {timerText(rec.seconds)}
            </span>
          </span>
          <Button variant="primary" iconLeft="player-stop" loading={saving} disabled={saving} onClick={() => void stop()}>
            Stop and save
          </Button>
        </div>
        <div className="tr-rec__row">
          <span className="tr-rec__label">Microphone</span>
          <span className="tr-rec__device">Default microphone</span>
          <Meter level={rec.level} label="Microphone level" />
        </div>
        {rec.silent ? (
          <Banner tone="warning" title="No sound from the microphone">
            Nothing has been heard for a while. Check that the right microphone is selected in your system's sound settings and that it is not muted.
          </Banner>
        ) : null}
        <p className="tr-rec__note">The transcript appears here after you press Stop. Everyone in the conversation should know it is being recorded. Audio and text stay on this computer.</p>
        {error ? (
          <p className="tr-dlg__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }
  return (
    <section className="lm-card tr-rec" aria-label="Record a conversation" data-testid="recorder">
      <div className="tr-rec__head">
        <h2 className="tr-rec__h">Record a conversation</h2>
        <IconButton name="x" label="Close the recorder" size={24} onClick={onClose} />
      </div>
      <Banner tone="info" title="Tell everyone before you record.">
        Recording other people can need their consent, and the rules depend on where you live. Speak Kit shows a red recording sign the whole time.
      </Banner>
      <div className="tr-rec__row">
        <span className="tr-rec__label">Microphone</span>
        <span className="tr-rec__device">Default microphone</span>
      </div>
      <p className="tr-rec__note">Only the microphone is recorded here. Nothing is saved until you press Start.</p>
      {error ? (
        <p className="tr-dlg__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="tr-rec__foot">
        <Button variant="primary" iconLeft="microphone" loading={starting} onClick={() => void start()}>
          Start recording
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <span className="tr-rec__local">Audio stays on this computer.</span>
      </div>
    </section>
  );
}
