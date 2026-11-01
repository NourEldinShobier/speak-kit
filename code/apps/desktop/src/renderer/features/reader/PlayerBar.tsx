import type { ReactElement } from "react";
import { Icon, IconButton, Popover, Slider, Spinner } from "@speakkit/ui";
import { MAX_SPEED, MIN_SPEED, type PlayerState, type Voice } from "@speakkit/protocol";
import { clock } from "../library/model";

export const SPEED_PRESETS = [0.8, 1, 1.2, 1.5, 2, 3];
export const SLEEP_CHOICES = [5, 15, 30, 45, 60];

export interface BarProps {
  title: string;
  state: PlayerState;
  /** shown until the player knows the real length */
  estimatedTotalMs: number;
  speed: number;
  voices: Voice[];
  voiceId: string;
  /** ms left on the sleep timer, 0 when off */
  sleepLeftMs: number;
  disabled: boolean;
  outlineOpen: boolean;
  onToggle(): void;
  onSkip(deltaMs: number): void;
  onBlock(dir: 1 | -1): void;
  onSeek(fraction: number): void;
  onSpeed(v: number): void;
  onVoice(id: string): void;
  onSleep(minutes: number | null): void;
  onOutline(): void;
}

const pillTrigger = (label: string, icon?: ReactElement) => (p: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog" }) => (
  <button type="button" className="rd-pill" {...p}>
    {icon}
    {label}
  </button>
);

export function PlayerBar(p: BarProps) {
  const s = p.state;
  const busy = s.status === "preparing";
  const playing = s.status === "playing" || busy;
  const total = s.totalMs || p.estimatedTotalMs;
  const frac = total ? Math.min(1, s.elapsedMs / total) : 0;
  const voice = p.voices.find((v) => v.id === p.voiceId);
  return (
    <footer className="rd-bar" aria-label="Player">
      <div className="rd-bar__now">
        <span className="rd-bar__tile"><Icon name="headphones" size={20} /></span>
        <div>
          <div className="rd-bar__title">{p.title}</div>
          <div className="rd-bar__sub">{voice ? `${voice.name} · Kokoro` : "Kokoro"}</div>
        </div>
      </div>
      <div className="rd-bar__center">
        <div className="rd-bar__buttons">
          <IconButton name="player-skip-back" label="Previous paragraph" disabled={p.disabled} onClick={() => p.onBlock(-1)} />
          <IconButton name="rewind-backward-10" label="Back 10 seconds" disabled={p.disabled} onClick={() => p.onSkip(-10_000)} />
          <button type="button" className="rd-play" aria-label={playing ? "Pause" : "Play"} disabled={p.disabled} onClick={p.onToggle}>
            {busy && s.elapsedMs === 0 ? <Spinner size={20} /> : <Icon name={playing ? "player-pause" : "player-play"} size={22} />}
          </button>
          <IconButton name="rewind-forward-10" label="Forward 10 seconds" disabled={p.disabled} onClick={() => p.onSkip(10_000)} />
          <IconButton name="player-skip-forward" label="Next paragraph" disabled={p.disabled} onClick={() => p.onBlock(1)} />
        </div>
        <div className="rd-bar__scrub">
          <span data-testid="elapsed">{clock(s.elapsedMs)}</span>
          <Slider min={0} max={1000} value={Math.round(frac * 1000)} disabled={p.disabled || s.status === "idle"} aria-label="Position" onCommit={(v) => p.onSeek(v / 1000)} />
          <span data-testid="total">{clock(total)}</span>
        </div>
      </div>
      <div className="rd-bar__right">
        <Popover side="top" align="end" width={300} title="Speed" trigger={pillTrigger(`${p.speed}x`)}>
          <div className="rd-pop">
            <div className="rd-pop__row"><span>Speed</span><b data-testid="speed-value">{p.speed.toFixed(1)}x</b></div>
            <Slider min={MIN_SPEED} max={MAX_SPEED} step={0.1} value={p.speed} aria-label="Speed" onChange={(v) => p.onSpeed(Math.round(v * 10) / 10)} />
            <div className="rd-presets">
              {SPEED_PRESETS.map((v) => (
                <button key={v} type="button" className="rd-preset" aria-pressed={p.speed === v} onClick={() => p.onSpeed(v)}>{v}x</button>
              ))}
            </div>
          </div>
        </Popover>
        <Popover side="top" align="end" width={280} title="Sleep timer" trigger={(t) => (
          <button type="button" className="rd-pill" aria-label="Sleep timer" {...t}>
            <Icon name="zzz" size={16} />
            {p.sleepLeftMs > 0 && <span data-testid="sleep-left">{clock(p.sleepLeftMs)}</span>}
          </button>
        )}>
          <div className="rd-pop">
            {p.sleepLeftMs > 0 && <div className="rd-pop__row"><span>Pauses in</span><b>{clock(p.sleepLeftMs)}</b></div>}
            {SLEEP_CHOICES.map((m) => (
              <button key={m} type="button" className="rd-option" onClick={() => p.onSleep(m)}>{m} minutes</button>
            ))}
            <button type="button" className="rd-option" disabled={p.sleepLeftMs === 0} onClick={() => p.onSleep(null)}>Off</button>
          </div>
        </Popover>
        <Popover side="top" align="end" width={280} title="Voice" trigger={(t) => <IconButton name="volume" label="Voice" {...t} />}>
          <div className="rd-pop rd-pop--list" role="listbox" aria-label="Voices">
            {p.voices.map((v) => (
              <button key={v.id} type="button" role="option" aria-selected={v.id === p.voiceId} className="rd-option" onClick={() => p.onVoice(v.id)}>
                <span>{v.name}</span>
                <small>{v.lang === "en-GB" ? "UK" : "US"} · {v.gender}</small>
                {v.id === p.voiceId && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </Popover>
        <IconButton name="list" label="Outline" aria-pressed={p.outlineOpen} onClick={p.onOutline} />
      </div>
    </footer>
  );
}
