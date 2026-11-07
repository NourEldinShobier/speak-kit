import type { KeyboardEvent } from "react";
import { Button, Checkbox, Icon, Modal, ProgressBar, type IconName } from "@speakkit/ui";
import { CLONE_MAX_MS, CLONE_MIN_MS, clock } from "@speakkit/protocol";
import type { Take } from "./audio";
import { CheckRows } from "./CheckRows";
import { lengthCheck, type MicProblem, type Source, type CloneState } from "./model";
import "./cloning.css";

type Choose = Extract<CloneState, { step: "choose" }>;

/** Consent text: the person has the right to clone this voice. */
export const CONSENT = "This is my own voice, or I have the right to clone it and the permission of the person speaking.";

const SOURCES: { id: Source; icon: IconName; title: string; body: string }[] = [
  { id: "upload", icon: "upload", title: "Upload a clip", body: "WAV, MP3, M4A or FLAC, up to 30 seconds." },
  { id: "record", icon: "microphone", title: "Record now", body: "Read a few sentences aloud." },
];

interface ChooseProps {
  state: Choose;
  onConsent(on: boolean): void;
  onSource(s: Source): void;
  onContinue(): void;
  onCancel(): void;
}

/** Arrow keys move through a radio group and select as they go (ARIA authoring practices); Home and End jump to the ends. */
function moveSource(e: KeyboardEvent<HTMLElement>, current: Source | null, onSource: (s: Source) => void) {
  const at = Math.max(
    0,
    SOURCES.findIndex((s) => s.id === current),
  );
  const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: SOURCES.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  const next = SOURCES[(to + SOURCES.length) % SOURCES.length]!;
  onSource(next.id);
  e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-source="${next.id}"]`)?.focus();
}

/** Choose where the reference comes from and confirm the right to clone it. */
export function ChooseScreen({ state, onConsent, onSource, onContinue, onCancel }: ChooseProps) {
  return (
    <>
      {state.error && (
        <p className="sk-clone-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="sk-clone-sources" role="radiogroup" aria-label="Where the voice sample comes from">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={state.source === s.id}
            className="sk-clone-source"
            data-source={s.id}
            tabIndex={(state.source ?? SOURCES[0]!.id) === s.id ? 0 : -1}
            onKeyDown={(e) => moveSource(e, state.source, onSource)}
            onClick={() => onSource(s.id)}
          >
            <Icon name={s.icon} size={18} />
            <b>{s.title}</b>
            <span>{s.body}</span>
          </button>
        ))}
      </div>
      <Checkbox label={CONSENT} checked={state.consent} onChange={(e) => onConsent(e.target.checked)} />
      <p className="sk-clone-note">Cloned voices speak through Chatterbox. Speak Kit switches to it while you clone and use them.</p>
      <div className="sk-clone-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!state.consent || !state.source || state.busy} loading={state.busy} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </>
  );
}

const OS_NAME: Record<string, string> = { win32: "Windows", darwin: "macOS" };
const SETTINGS_LABEL: Record<string, string> = { win32: "Open Windows settings", darwin: "Open System Settings" };

/** The words of the microphone dialog. The settings button exists only when the microphone is blocked and the OS has a privacy page for it (Windows, macOS). */
export function micText(problem: MicProblem, platform: string): { title: string; body: string; settings: string | null } {
  if (problem === "missing") return { title: "No microphone found", body: "Speak Kit found no microphone. Connect one and try again, or upload an audio file instead.", settings: null };
  const os = OS_NAME[platform] ?? "Your system";
  return {
    title: "Microphone access is off",
    body: `${os} blocks Speak Kit from using the microphone, which is needed to record a voice sample. You can upload an audio file instead.`,
    settings: SETTINGS_LABEL[platform] ?? null,
  };
}

interface MicProps {
  problem: MicProblem | null;
  platform: string;
  onUpload(): void;
  onSettings(): void;
  onClose(): void;
}

/** The microphone cannot be used. The OS settings button exists where the OS has a microphone privacy page. */
export function MicDialog({ problem, platform, onUpload, onSettings, onClose }: MicProps) {
  const t = problem ? micText(problem, platform) : { title: "", body: "", settings: null };
  return (
    <Modal
      open={problem !== null}
      onClose={onClose}
      title={t.title}
      width={480}
      footer={
        <>
          <Button onClick={onUpload}>Upload a file</Button>
          {t.settings && (
            <Button variant="primary" onClick={onSettings}>
              {t.settings}
            </Button>
          )}
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {t.body}
      </p>
    </Modal>
  );
}

interface RecordingProps {
  elapsedMs: number;
  level: number;
  onStop(): void;
  onCancel(): void;
}

/** Recording with a timer, a progress bar to 30 s and a level meter. */
export function RecordingScreen({ elapsedMs, level, onStop, onCancel }: RecordingProps) {
  const short = elapsedMs < CLONE_MIN_MS;
  return (
    <>
      <div className="lm-card sk-clone-card">
        <div className="lm-row lm-row--control">
          <div className="lm-row__text">
            <div className="sk-clone-timer" aria-live="off">
              {clock(elapsedMs)} / {clock(CLONE_MAX_MS)}
            </div>
          </div>
          <div className="lm-row__control">
            <Button variant="primary" iconLeft="player-stop" onClick={onStop}>
              Stop
            </Button>
          </div>
        </div>
        <div className="sk-clone-bars">
          <ProgressBar value={(elapsedMs / CLONE_MAX_MS) * 100} thin label="Recording length" />
          <ProgressBar value={level * 100} thin label="Microphone level" className="sk-clone-meter" />
          <p className="sk-clone-note">{short ? `Keep recording until at least ${clock(CLONE_MIN_MS)}.` : "Press Stop when you are done."}</p>
        </div>
      </div>
      <div className="sk-clone-actions">
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </>
  );
}

interface ReviewProps {
  take: Take;
  playing: boolean;
  onPlay(): void;
  onAgain(): void;
  onUse(): void;
}

/** Listen to the take before it is used. */
export function ReviewScreen({ take, playing, onPlay, onAgain, onUse }: ReviewProps) {
  const check = lengthCheck(take.durationMs);
  return (
    <>
      <div className="lm-card sk-clone-card">
        <div className="lm-row lm-row--control">
          <div className="lm-row__control">
            <Button iconLeft={playing ? "player-stop" : "player-play"} onClick={onPlay}>
              {playing ? "Stop" : "Play take"}
            </Button>
            <span className="sk-clone-clock">{clock(take.durationMs)}</span>
          </div>
        </div>
        <CheckRows checks={[check]} />
      </div>
      <div className="sk-clone-actions">
        <Button onClick={onAgain}>Record again</Button>
        <Button variant="primary" disabled={!check.ok} onClick={onUse}>
          Use this take
        </Button>
      </div>
    </>
  );
}
