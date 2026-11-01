import { Avatar, Button, Icon, IconButton, ProgressBar, Slider, ToggleButton } from "@speakkit/ui";
import { VoiceList, voiceLine, voiceName } from "../../features/voices";
import { clampSpeed, clock, speedLabel, timeLeft } from "../../shared/format";
import type { PopupActions, PopupModel } from "./types";

const SPEEDS = [0.5, 1, 1.2, 1.5, 2, 3];

export function VoiceSpeedRow({ m, speedOpen, onVoice, onSpeed }: { m: PopupModel; speedOpen: boolean; onVoice: () => void; onSpeed: () => void }) {
  const list = m.voices.voices;
  return (
    <div className="pp-vs">
      <Button className="pp-voicebtn" onClick={onVoice}>
        <span className="sk-sr">Voice: </span>
        <Avatar name={voiceName(list, m.voice)} size={20} tone="accent" aria-hidden />
        <span className="sk-grow">{voiceLine(list, m.voice)}</span>
        <Icon name="chevron-down" size={14} />
      </Button>
      <Button className="pp-speedbtn" aria-expanded={speedOpen} aria-label={`Speed ${speedLabel(m.speed)}`} onClick={onSpeed}>
        {speedLabel(m.speed)}
      </Button>
    </div>
  );
}

export function SpeedPanel({ m, a }: { m: PopupModel; a: PopupActions }) {
  return (
    <section className="pp-speed">
      <div className="pp-slider">
        <div className="sk-grow">
          <Slider aria-label="Speed" value={m.speed} min={0.5} max={3} step={0.1} onChange={(v) => a.setSpeed(clampSpeed(v))} />
          <div className="pp-slider-l">
            <span>0.5x</span>
            <span>3x</span>
          </div>
        </div>
        <output aria-live="polite">{speedLabel(m.speed)}</output>
      </div>
      <div className="pp-presets" role="group" aria-label="Speed presets">
        {SPEEDS.map((s) => (
          <ToggleButton key={s} pressed={Math.abs(s - m.speed) < 0.05} onClick={() => a.setSpeed(s)}>
            {speedLabel(s)}
          </ToggleButton>
        ))}
      </div>
      <div className="pp-speed-f">
        <Button variant="ghost" size="sm" iconLeft="refresh" onClick={() => a.setSpeed(1)}>
          Reset to 1x
        </Button>
        <span>Arrow keys change speed by 0.1x</span>
      </div>
    </section>
  );
}

export function VoicePanel({ m, a, onDone }: { m: PopupModel; a: PopupActions; onDone: () => void }) {
  const p = m.player;
  return (
    <>
      <div className="pp-mini">
        <IconButton name={p?.status === "playing" ? "player-pause" : "player-play"} label={p?.status === "playing" ? "Pause" : "Play"} onClick={a.toggle} />
        <div className="sk-grow">
          <ProgressBar thin value={p && p.totalMs ? Math.min(100, (p.elapsedMs / p.totalMs) * 100) : 0} label="Progress" />
          <div className="pp-times">
            <span>{clock(p?.elapsedMs ?? 0)}</span>
            <span>{timeLeft(p?.elapsedMs ?? 0, p?.totalMs ?? 0)}</span>
          </div>
        </div>
      </div>
      <div className="sk-voices__head">
        <h2>Voice</h2>
        <button type="button" className="sk-link" onClick={onDone}>
          Done
          <Icon name="chevron-up" size={14} />
        </button>
      </div>
      <VoiceList state={m.voices} selected={m.voice} onSelect={a.setVoice} onPreview={a.preview} />
      <p className="pp-note">
        <Icon name="info-circle" size={14} />
        <span>Quality is Kokoro's own rating, from A (best) to C. Previewing a voice pauses the reading.</span>
      </p>
    </>
  );
}
