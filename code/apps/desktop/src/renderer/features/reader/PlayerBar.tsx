import type { ReactElement } from "react";
import { Icon, IconButton, Popover, Slider, Spinner } from "@speakkit/ui";
import type { PlayerState, Voice } from "@speakkit/protocol";
import { clock } from "../library/model";
import { SpeedControls, VoiceList } from "./Controls";

const SLEEP_CHOICES = [5, 15, 30, 45, 60];

interface BarProps {
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
  panel: "outline" | "voice" | null;
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
        <span className="rd-bar__tile">
          <Icon name="headphones" size={20} />
        </span>
        <div>
          <div className="rd-bar__title" dir="auto">
            {p.title}
          </div>
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
            <SpeedControls speed={p.speed} onSpeed={p.onSpeed} />
          </div>
        </Popover>
        <Popover
          side="top"
          align="end"
          width={280}
          title="Sleep timer"
          trigger={(t) => (
            <button type="button" className="rd-pill" aria-label="Sleep timer" {...t}>
              <Icon name="zzz" size={16} />
              {p.sleepLeftMs > 0 && <span data-testid="sleep-left">{clock(p.sleepLeftMs)}</span>}
            </button>
          )}
        >
          <div className="rd-pop">
            {p.sleepLeftMs > 0 && (
              <div className="rd-pop__row">
                <span>Pauses in</span>
                <b>{clock(p.sleepLeftMs)}</b>
              </div>
            )}
            {SLEEP_CHOICES.map((m) => (
              <button key={m} type="button" className="rd-option" onClick={() => p.onSleep(m)}>
                {m} minutes
              </button>
            ))}
            <button type="button" className="rd-option" disabled={p.sleepLeftMs === 0} onClick={() => p.onSleep(null)}>
              Off
            </button>
          </div>
        </Popover>
        <Popover side="top" align="end" width={280} title="Voice" trigger={(t) => <IconButton name="volume" label="Voice" {...t} />}>
          <VoiceList voices={p.voices} voiceId={p.voiceId} onVoice={p.onVoice} />
        </Popover>
        <IconButton name="list" label="Outline" aria-pressed={p.panel === "outline"} onClick={p.onOutline} />
      </div>
    </footer>
  );
}
