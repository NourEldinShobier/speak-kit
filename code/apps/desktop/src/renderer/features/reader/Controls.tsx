import { Icon, Slider } from "@speakkit/ui";
import { MAX_SPEED, MIN_SPEED, type Voice } from "@speakkit/protocol";

const SPEED_PRESETS = [0.8, 1, 1.2, 1.5, 2, 3];

/** Speed slider with presets: the speed popover in the player bar and the docked voice panel show the same control. */
export function SpeedControls({ speed, onSpeed }: { speed: number; onSpeed(v: number): void }) {
  return (
    <>
      <div className="rd-pop__row">
        <span>Speed</span>
        <b data-testid="speed-value">{speed.toFixed(1)}x</b>
      </div>
      <Slider min={MIN_SPEED} max={MAX_SPEED} step={0.1} value={speed} aria-label="Speed" onChange={(v) => onSpeed(Math.round(v * 10) / 10)} />
      <div className="rd-presets">
        {SPEED_PRESETS.map((v) => (
          <button key={v} type="button" className="rd-preset" aria-pressed={speed === v} onClick={() => onSpeed(v)}>
            {v}x
          </button>
        ))}
      </div>
    </>
  );
}

export function VoiceList({ voices, voiceId, onVoice }: { voices: Voice[]; voiceId: string; onVoice(id: string): void }) {
  return (
    <div className="rd-pop rd-pop--list" role="listbox" aria-label="Voices">
      {voices.map((v) => (
        <button key={v.id} type="button" role="option" aria-selected={v.id === voiceId} className="rd-option" onClick={() => onVoice(v.id)}>
          <span>{v.name}</span>
          <small>
            {v.lang === "en-GB" ? "UK" : "US"} · {v.gender}
          </small>
          {v.id === voiceId && <Icon name="check" size={14} />}
        </button>
      ))}
    </div>
  );
}
