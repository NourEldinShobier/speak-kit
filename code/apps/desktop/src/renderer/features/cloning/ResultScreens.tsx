import { Banner, Button, Icon, ProgressBar, Slider, Spinner, TextInput } from "@speakkit/ui";
import type { CloneCheck } from "@speakkit/protocol";
import { CheckRows } from "./CheckRows";
import { testSentence, type CloneState } from "./model";
import "./cloning.css";

type Analyzing = Extract<CloneState, { step: "analyzing" }>;
type Naming = Extract<CloneState, { step: "naming" }>;

const MARK = {
  done: <Icon name="circle-check" size={16} className="sk-clone-ok" />,
  active: <Spinner size={16} />,
  waiting: <span className="sk-clone-dot" aria-hidden="true" />,
};

function Progress({ state, label }: { state: keyof typeof MARK; label: string }) {
  return (
    <div className="sk-clone-step" data-state={state}>
      {MARK[state]}
      <span>{label}</span>
    </div>
  );
}

interface AnalyzingProps {
  state: Analyzing;
  /** 0..1 while Chatterbox loads, null when it does not say. */
  progress: number | null;
  onCancel(): void;
}

/** G5: the clip is checked, then Chatterbox loads so the test sentence can play at once. */
export function AnalyzingScreen({ state, progress, onCancel }: AnalyzingProps) {
  const loading = state.phase === "loading";
  const pct = progress === null ? undefined : Math.round(progress * 100);
  return (
    <>
      <div className="lm-card sk-clone-card sk-clone-steps">
        <Progress state="done" label="Clip received" />
        <Progress state={loading ? "done" : "active"} label="Checking the clip" />
        <Progress state={loading ? "active" : "waiting"} label={`Loading Chatterbox onto the GPU${pct === undefined || !loading ? "" : `, ${pct}%`}`} />
        <ProgressBar value={loading ? pct : undefined} thin label="Progress" />
      </div>
      <div className="sk-clone-actions">
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </>
  );
}

interface RejectedProps {
  message: string;
  checks: CloneCheck[];
  onUpload(): void;
  onRecord(): void;
}

/** G7: the clip cannot be used; every criterion the server judged gets a row. A file the server could not read has no criteria and shows its message. */
export function RejectedScreen({ message, checks, onUpload, onRecord }: RejectedProps) {
  return (
    <>
      <div className="lm-card sk-clone-card">
        {checks.length > 0 ? (
          <CheckRows checks={checks} />
        ) : (
          <p className="sk-clone-error" role="alert">
            {message}
          </p>
        )}
      </div>
      <div className="sk-clone-actions">
        <Button iconLeft="upload" onClick={onUpload}>
          Choose another file
        </Button>
        <Button variant="primary" iconLeft="microphone" onClick={onRecord}>
          Record
        </Button>
      </div>
    </>
  );
}

interface NamingProps {
  state: Naming;
  playing: boolean;
  onName(name: string): void;
  onStyle(value: number): void;
  onPlay(): void;
  onSave(): void;
  onCancel(): void;
}

/** G6: name the voice, hear the test sentence, set the exaggeration and save. */
export function NamingScreen({ state, playing, onName, onStyle, onPlay, onSave, onCancel }: NamingProps) {
  const named = state.name.trim().length > 0;
  return (
    <>
      {state.error && <Banner tone="error">{state.error}</Banner>}
      <div className="lm-card sk-clone-card">
        <div className="lm-row lm-row--control">
          <TextInput className="sk-clone-name" label="Name" placeholder="Voice name" maxLength={60} value={state.name} onChange={(e) => onName(e.target.value)} data-autofocus />
        </div>
        <div className="lm-row lm-row--control">
          <div className="lm-row__control">
            <Button iconLeft={playing ? "player-stop" : "player-play"} onClick={onPlay}>
              {playing ? "Stop" : "Play test"}
            </Button>
          </div>
          <div className="lm-row__text">
            <div className="lm-row__desc">{testSentence(state.name)}</div>
          </div>
        </div>
        <StyleSlider
          label="Exaggeration"
          hint="Higher is more expressive."
          low="Calm"
          high="Dramatic"
          value={state.exaggeration}
          onChange={onStyle}
        />
      </div>
      <div className="sk-clone-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!named || state.saving} loading={state.saving} onClick={onSave}>
          Save voice
        </Button>
      </div>
    </>
  );
}

interface SliderProps {
  label: string;
  hint: string;
  low: string;
  high: string;
  value: number;
  onChange(v: number): void;
  onCommit?: (v: number) => void;
}

/** A 0 to 1 slider with its name, a hint, the value on the right and the names of both ends underneath (2.17 slider). */
export function StyleSlider({ label, hint, low, high, value, onChange, onCommit }: SliderProps) {
  return (
    <div className="sk-clone-slider">
      <div className="sk-clone-slider__head">
        <span>
          <b>{label}</b>
          <small>{hint}</small>
        </span>
        <output>{value.toFixed(2)}</output>
      </div>
      <Slider aria-label={label} min={0} max={1} step={0.05} value={value} onChange={(v) => onChange(Math.round(v * 100) / 100)} {...(onCommit && { onCommit })} />
      <div className="sk-clone-slider__ends">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
