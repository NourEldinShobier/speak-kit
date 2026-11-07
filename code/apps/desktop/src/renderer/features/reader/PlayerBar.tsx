import { Fragment, type ReactElement } from "react";
import { Icon, IconButton, Popover, Slider } from "@speakkit/ui";
import type { PlayerState, Voice } from "@speakkit/protocol";
import { clock } from "../library";
import { CustomiseToolbar } from "./CustomiseToolbar";
import { SpeedControls, VoiceList } from "./Controls";
import type { Panel } from "./state";
import { FOOTER_IDS, type FooterId } from "./toolbar";

const SLEEP_CHOICES = [5, 15, 30, 45, 60];

interface BarProps {
  state: PlayerState;
  /** shown until the player knows the real length */
  estimatedTotalMs: number;
  speed: number;
  voices: Voice[];
  voiceId: string;
  /** ms left on the sleep timer, 0 when off */
  sleepLeftMs: number;
  disabled: boolean;
  panel: Panel;
  /** Output level, 0 to 1. */
  volume: number;
  /** Right-hand controls the person turned off. */
  hidden: readonly FooterId[];
  onToggle(): void;
  onSkip(deltaMs: number): void;
  onBlock(dir: 1 | -1): void;
  onSeek(fraction: number): void;
  onSpeed(v: number): void;
  onVoice(id: string): void;
  onSleep(minutes: number | null): void;
  onOutline(): void;
  onVolume(v: number): void;
  onShown(id: FooterId, shown: boolean): void;
}

const pillTrigger = (label: string, icon?: ReactElement) => (p: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog" }) => (
  <button type="button" className="rd-pill" {...p}>
    {icon}
    {label}
  </button>
);

function SleepPopover({ leftMs, onSleep }: { leftMs: number; onSleep(minutes: number | null): void }) {
  return (
    <Popover
      side="top"
      align="end"
      width={280}
      title="Sleep timer"
      trigger={(t) => (
        <button type="button" className="rd-pill" aria-label="Sleep timer" {...t}>
          <Icon name="zzz" size={16} />
          {leftMs > 0 && <span data-testid="sleep-left">{clock(leftMs)}</span>}
        </button>
      )}
    >
      <div className="rd-pop">
        {leftMs > 0 && (
          <div className="rd-pop__row">
            <span>Pauses in</span>
            <b>{clock(leftMs)}</b>
          </div>
        )}
        {SLEEP_CHOICES.map((m) => (
          <button key={m} type="button" className="rd-option" onClick={() => onSleep(m)}>
            {m} minutes
          </button>
        ))}
        <button type="button" className="rd-option" disabled={leftMs === 0} onClick={() => onSleep(null)}>
          Off
        </button>
      </div>
    </Popover>
  );
}

function VolumePopover({ volume, onVolume }: { volume: number; onVolume(v: number): void }) {
  return (
    <Popover side="top" align="end" width={240} title="Volume" trigger={(t) => <IconButton name="volume" label="Volume" {...t} />}>
      <div className="rd-pop">
        <div className="rd-pop__row">
          <span>Volume</span>
          <b data-testid="volume-value">{Math.round(volume * 100)}%</b>
        </div>
        <Slider min={0} max={100} step={1} value={Math.round(volume * 100)} aria-label="Volume" onChange={(v) => onVolume(v / 100)} />
      </div>
    </Popover>
  );
}

function VoicePopover({ voices, voiceId, onVoice }: Pick<BarProps, "voices" | "voiceId" | "onVoice">) {
  const name = voices.find((v) => v.id === voiceId)?.name ?? "Voice";
  return (
    <Popover
      side="top"
      align="end"
      width={280}
      title="Voice"
      hideTitle
      className="rd-voicepop"
      trigger={(t) => (
        <button type="button" className="rd-pill rd-pill--voice" aria-label={`Voice: ${name}`} {...t}>
          <span>{name}</span>
        </button>
      )}
    >
      <VoiceList voices={voices} voiceId={voiceId} onVoice={onVoice} />
    </Popover>
  );
}

function Transport(p: BarProps & { playing: boolean; busy: boolean }) {
  return (
    <div className="rd-bar__buttons">
      <IconButton name="player-skip-back" label="Previous paragraph" disabled={p.disabled} onClick={() => p.onBlock(-1)} />
      <IconButton name="rewind-backward-10" label="Back 10 seconds" disabled={p.disabled} onClick={() => p.onSkip(-10_000)} />
      <IconButton
        variant="primary"
        round
        size={40}
        glyph={22}
        name={p.playing ? "player-pause" : "player-play"}
        label={p.playing ? "Pause" : "Play"}
        loading={p.busy && p.state.elapsedMs === 0}
        disabled={p.disabled}
        onClick={p.onToggle}
      />
      <IconButton name="rewind-forward-10" label="Forward 10 seconds" disabled={p.disabled} onClick={() => p.onSkip(10_000)} />
      <IconButton name="player-skip-forward" label="Next paragraph" disabled={p.disabled} onClick={() => p.onBlock(1)} />
    </div>
  );
}

/** Left: transport. Middle: time, position slider, end time. Right: speed, voice, sleep timer, volume, queue and the "…" button that customises them. */
export function PlayerBar(p: BarProps) {
  const s = p.state;
  const busy = s.status === "preparing";
  const playing = s.status === "playing" || busy;
  const total = s.totalMs || p.estimatedTotalMs;
  const frac = total ? Math.min(1, s.elapsedMs / total) : 0;
  const items: Record<FooterId, ReactElement> = {
    speed: (
      <Popover side="top" align="end" width={300} title="Speed" trigger={pillTrigger(`${p.speed}x`)}>
        <div className="rd-pop">
          <SpeedControls speed={p.speed} onSpeed={p.onSpeed} />
        </div>
      </Popover>
    ),
    voice: <VoicePopover voices={p.voices} voiceId={p.voiceId} onVoice={p.onVoice} />,
    sleep: <SleepPopover leftMs={p.sleepLeftMs} onSleep={p.onSleep} />,
    volume: <VolumePopover volume={p.volume} onVolume={p.onVolume} />,
    queue: <IconButton name="list" label="Queue" aria-pressed={p.panel === "outline"} onClick={p.onOutline} />,
  };
  return (
    <footer className="rd-bar" aria-label="Player">
      <Transport {...p} playing={playing} busy={busy} />
      <div className="rd-bar__scrub">
        <span data-testid="elapsed">{clock(s.elapsedMs)}</span>
        <Slider min={0} max={1000} value={Math.round(frac * 1000)} disabled={p.disabled || s.status === "idle"} aria-label="Position" onCommit={(v) => p.onSeek(v / 1000)} />
        <span data-testid="total">{clock(total)}</span>
      </div>
      <div className="rd-bar__right">
        {FOOTER_IDS.filter((id) => !p.hidden.includes(id)).map((id) => (
          <Fragment key={id}>{items[id]}</Fragment>
        ))}
        <CustomiseToolbar label="Customise player toolbar" ids={FOOTER_IDS} hidden={p.hidden} side="top" onShown={p.onShown} />
      </div>
    </footer>
  );
}
