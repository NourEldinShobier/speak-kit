import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlayerState } from "@speakkit/protocol";
import { Avatar, Button, EmptyState, Icon, IconButton, Kbd, Logo, ProgressBar, Slider, StatusPill, ToggleButton, type IconName } from "@speakkit/ui";
import { headerBadge, type PopupView } from "../../features/connection";
import { Scrubber, Transport } from "../../features/player";
import { splitShortcut } from "../../features/settings";
import { VoiceList, voiceLine, voiceName, type VoicesState } from "../../features/voices";
import { clampSpeed, clock, estimateMs, hostOf, minutes, speedLabel, timeLeft } from "../../shared/format";
import type { QueueItem } from "../../shared/client";
import type { EngineState } from "@speakkit/protocol";

const SPEEDS = [0.5, 1, 1.2, 1.5, 2, 3];
const TONE = { ok: "green", warn: "orange", err: "red", neutral: "neutral" } as const;

export interface PopupModel {
  view: PopupView;
  title: string;
  host: string;
  player: PlayerState | null;
  voice: string;
  speed: number;
  selection: string;
  /** characters of readable text on the page, for the time estimate */
  chars: number;
  next?: QueueItem;
  queued: number;
  engine?: EngineState;
  engineProgress?: number;
  voices: VoicesState;
  /** keyboard commands as Chrome has them assigned: name to shortcut */
  shortcuts: Record<string, string | undefined>;
  /** state of the "Open SpeakKit" deep link */
  launch: "idle" | "starting" | "failed";
}
export interface PopupActions {
  listenPage(): void;
  listenSelection(): void;
  readerView(): void;
  toggle(): void;
  stop(): void;
  replay(): void;
  seekMs(d: number): void;
  seekTo(ms: number): void;
  block(d: 1 | -1): void;
  setVoice(id: string): void;
  setSpeed(v: number): void;
  preview(id: string): void;
  playNext(): void;
  openApp(): void;
  download(): void;
  recheck(): void;
  pasteToken(): void;
  options(): void;
  extSettings(): void;
  help(): void;
  learn(): void;
}

const Header = ({ view, engine, onOptions }: { view: PopupView; engine?: EngineState; onOptions: () => void }) => {
  const b = headerBadge(view, engine);
  return (
    <header className="pp-head">
      <div className="pp-brand">
        <Logo size={24} />
        <span>SpeakKit</span>
      </div>
      <StatusPill tone={TONE[b.tone]}>{b.label}</StatusPill>
      <IconButton name="adjustments" label="Open settings" onClick={onOptions} />
    </header>
  );
};

const Foot = ({ left = "Runs on this computer", right = "Open app", onRight }: { left?: string; right?: string; onRight: () => void }) => (
  <footer className="pp-foot">
    <span className="pp-foot-l">
      <Icon name="lock" size={13} />
      {left}
    </span>
    <button type="button" className="sk-link" onClick={onRight}>
      {right}
      <Icon name="external-link" size={13} />
    </button>
  </footer>
);

const Msg = ({
  icon,
  title,
  body,
  primary,
  secondary,
  note,
}: {
  icon: IconName;
  title: string;
  body: string;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  note?: ReactNode;
}) => (
  <section role="alert">
    <EmptyState icon={icon} title={title} primary={primary} secondary={secondary}>
      {body}
    </EmptyState>
    {note}
  </section>
);

const NowCard = ({ title, sub }: { title: string; sub: string }) => (
  <section className="pp-now">
    <span className="pp-now__ic">
      <Icon name="world" size={18} />
    </span>
    <div className="pp-now__t">
      <div className="pp-title">{title}</div>
      <div className="pp-sub">{sub}</div>
    </div>
  </section>
);

const Keys = ({ keys }: { keys: string[] }) => (
  <span className="lm-kbds">
    {keys.map((k, i) => (
      <Kbd key={i} small>
        {k}
      </Kbd>
    ))}
  </span>
);

const Shortcuts = ({ map }: { map: Record<string, string | undefined> }) => (
  <section className="pp-keys" aria-label="Shortcuts">
    <div>
      <span>Read selection</span>
      <Keys keys={splitShortcut(map["read-selection"])} />
    </div>
    <div>
      <span>Play / pause</span>
      <Keys keys={splitShortcut(map["play-pause"])} />
    </div>
  </section>
);

function VoiceSpeedRow({ m, speedOpen, onVoice, onSpeed }: { m: PopupModel; speedOpen: boolean; onVoice: () => void; onSpeed: () => void }) {
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

function SpeedPanel({ m, a }: { m: PopupModel; a: PopupActions }) {
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

function VoicePanel({ m, a, onDone }: { m: PopupModel; a: PopupActions; onDone: () => void }) {
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

export function PopupScreen({ m, a }: { m: PopupModel; a: PopupActions }) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const { view } = m;
  const p = m.player;
  const home = view === "idle" || view === "selection" || view === "preparing" || view === "loading-model" || view === "playing" || view === "paused" || view === "finished";
  useEffect(() => {
    if (!home) {
      setVoiceOpen(false);
      setSpeedOpen(false);
    }
  }, [home]);
  // Closing the voice picker or speed panel with Escape puts keyboard focus back on the button that opened it.
  const refocus = useRef<".pp-voicebtn" | ".pp-speedbtn" | null>(null);
  useEffect(() => {
    if (!refocus.current || voiceOpen || speedOpen) return;
    document.querySelector<HTMLElement>(refocus.current)?.focus();
    refocus.current = null;
  }, [voiceOpen, speedOpen]);
  // On the document, not the screen: opening the picker unmounts the button that had focus, and keys then go to body.
  useEffect(() => {
    if (!voiceOpen && !speedOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      refocus.current = voiceOpen ? ".pp-voicebtn" : ".pp-speedbtn";
      setVoiceOpen(false);
      setSpeedOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [voiceOpen, speedOpen]);

  let body: ReactNode;
  let foot: ReactNode = <Foot onRight={a.openApp} />;
  const launchNote =
    m.launch === "starting" ? (
      <p className="pp-launch" role="status">
        Starting SpeakKit...
      </p>
    ) : m.launch === "failed" ? (
      <p className="pp-launch" role="status">
        SpeakKit did not start. Open it from the Start menu, or download it first.
      </p>
    ) : null;
  switch (view) {
    case "install":
      body = (
        <Msg
          icon="download"
          title="Install SpeakKit to start listening"
          body="SpeakKit reads pages aloud with a voice that runs on this computer. Nothing you read is uploaded."
          primary={{ label: "Download SpeakKit for Windows", onClick: a.download }}
          secondary={{ label: "I already installed it", onClick: a.recheck }}
        />
      );
      foot = <Foot left="Free. Works offline." right="Learn more" onRight={a.learn} />;
      break;
    case "offline":
      body = (
        <Msg
          icon="power"
          title="SpeakKit isn't running"
          body="The extension reads with the SpeakKit desktop app on this computer. Open the app and this popup connects by itself."
          primary={{ label: m.launch === "starting" ? "Starting..." : "Open SpeakKit", onClick: a.openApp }}
          secondary={{ label: "Download the app", onClick: a.download }}
          note={launchNote}
        />
      );
      foot = <Foot right="Troubleshooting" onRight={a.help} />;
      break;
    case "token":
      body = (
        <Msg
          icon="link"
          title="Pair SpeakKit with this browser again"
          body="The app and this browser no longer share a pairing token. This usually happens after reinstalling one of them."
          primary={{ label: "Paste new token", onClick: a.pasteToken }}
          secondary={{ label: "Open SpeakKit", onClick: a.openApp }}
          note={launchNote}
        />
      );
      foot = <Foot right="Extension options" onRight={a.options} />;
      break;
    case "version":
      body = (
        <Msg
          icon="refresh"
          title="SpeakKit needs an update"
          body="The app and this extension no longer speak the same version of the protocol. Install the latest release of both; your settings are kept."
          primary={{ label: "Download the latest app", onClick: a.download }}
          secondary={{ label: "Check again", onClick: a.recheck }}
        />
      );
      foot = <Foot right="Troubleshooting" onRight={a.help} />;
      break;
    case "pdf":
      body = (
        <Msg
          icon="file-text"
          title="Chrome's PDF viewer can't be read"
          body="Extensions cannot reach text inside the PDF viewer. Select the text you want, copy it, and paste it into the app."
          primary={{ label: "Paste text in the app", onClick: a.openApp }}
          note={launchNote}
        />
      );
      break;
    case "unreadable":
      body = (
        <Msg
          icon="lock-off"
          title="Can't read this page"
          body="Chrome blocks extensions on its own pages (chrome://, the Web Store). Open a normal website or paste text into the app."
          primary={{ label: "Paste text in the app", onClick: a.openApp }}
          note={launchNote}
        />
      );
      break;
    case "fileurl":
      body = (
        <Msg
          icon="file-text"
          title="Allow access to file URLs"
          body="Chrome needs one more permission to read local files. Turn on “Allow access to file URLs” in the extension settings."
          primary={{ label: "Open extension settings", onClick: a.extSettings }}
          secondary={{ label: "Paste text in the app", onClick: a.openApp }}
          note={launchNote}
        />
      );
      break;
    case "engine-missing":
      body = (
        <Msg
          icon="alert-triangle"
          title="The voice engine isn't ready"
          body="SpeakKit is running but the Kokoro voice model isn't installed or failed to start. Open the app to download or repair it."
          primary={{ label: "Open SpeakKit", onClick: a.openApp }}
          secondary={{ label: "Check again", onClick: a.recheck }}
          note={launchNote}
        />
      );
      break;
    default: {
      const busy = view === "preparing" || view === "loading-model";
      const live = view === "playing" || view === "paused" || view === "finished";
      const est = estimateMs(m.chars, m.speed);
      const sentences = m.selection ? Math.max(1, m.selection.split(/[.!?]+(?:\s|$)/).filter(Boolean).length) : 0;
      const sub =
        view === "selection"
          ? `${m.host} · ${sentences} sentence${sentences === 1 ? "" : "s"}, about ${Math.max(1, Math.round(estimateMs(m.selection.length, m.speed) / 1000))} s`
          : view === "finished"
            ? `${m.host} · finished`
            : live
              ? `${m.host} · ${clock(p!.totalMs)} at ${speedLabel(m.speed)}`
              : m.chars
                ? `${m.host} · ${clock(est)} at ${speedLabel(m.speed)}`
                : `${m.host} · ${speedLabel(m.speed)}`;
      const status = view === "playing" ? "playing" : view === "finished" ? "finished" : view === "paused" ? "paused" : "busy";
      const dl = m.engineProgress !== undefined && view === "loading-model";
      const waking = view === "loading-model" && m.engine === "unloaded";
      body = voiceOpen ? (
        <>
          <NowCard title={view === "selection" ? "Selected text" : m.title} sub={sub} />
          <VoicePanel
            m={m}
            a={a}
            onDone={() => {
              refocus.current = ".pp-voicebtn";
              setVoiceOpen(false);
            }}
          />
        </>
      ) : (
        <>
          <NowCard title={view === "selection" ? "Selected text" : m.title} sub={sub} />
          {view === "idle" && (
            <section className="pp-actions">
              <Button variant="primary" size="lg" className="sk-fill" iconLeft="player-play" onClick={a.listenPage}>
                Listen to this page
              </Button>
              <div className="pp-two">
                <Button className="sk-fill" iconLeft="scan" disabled={!m.selection} onClick={a.listenSelection}>
                  From selection
                </Button>
                <Button className="sk-fill" iconLeft="book" onClick={a.readerView}>
                  Reader view
                </Button>
              </div>
              <p className="pp-hint">{m.engine === "unloaded" ? "The voice wakes when you press play. Select text to read just that part." : "Select text on the page to read just that part."}</p>
            </section>
          )}
          {view === "selection" && (
            <section className="pp-actions">
              <blockquote className="pp-quote">“{m.selection.length > 160 ? `${m.selection.slice(0, 157).trimEnd()}…` : m.selection}”</blockquote>
              <Button variant="primary" size="lg" className="sk-fill" iconLeft="player-play" onClick={a.listenSelection}>
                Listen to selection
              </Button>
            </section>
          )}
          {(busy || live) && (
            <section className="pp-controls">
              {busy ? (
                <div className="pp-prog">
                  <ProgressBar label={dl ? "Downloading voice model" : waking ? "Waking the voice engine" : "Preparing audio"} value={dl ? (m.engineProgress ?? 0) * 100 : undefined} />
                  <p>
                    {view === "loading-model"
                      ? dl
                        ? `Downloading the voice model, ${Math.round((m.engineProgress ?? 0) * 100)}%.`
                        : waking
                          ? "Waking the voice engine. This takes a few seconds."
                          : "Starting the voice engine. The first time takes a few seconds."
                      : "Preparing the first sentence. This takes a few seconds."}
                  </p>
                </div>
              ) : (
                <Scrubber p={p!} finished={view === "finished"} a={a} />
              )}
              <Transport status={status} a={a} />
              {busy && (
                <Button variant="ghost" size="sm" iconLeft="x" onClick={a.stop}>
                  Cancel
                </Button>
              )}
              {view === "finished" && <span className="pp-hint">Replay from the start</span>}
            </section>
          )}
          {view === "finished" && m.next && (
            <section className="pp-next">
              <div>
                <span>Up next · 1 of {m.queued} queued</span>
                <b>{m.next.title}</b>
                <span>
                  {hostOf(m.next.url)} · {minutes(m.next.estMs)}
                </span>
              </div>
              <Button variant="primary" size="sm" onClick={a.playNext}>
                Play next
              </Button>
            </section>
          )}
          <hr />
          <VoiceSpeedRow
            m={m}
            speedOpen={speedOpen}
            onVoice={() => {
              setVoiceOpen(true);
              setSpeedOpen(false);
            }}
            onSpeed={() => setSpeedOpen((x) => !x)}
          />
          {speedOpen ? <SpeedPanel m={m} a={a} /> : <Shortcuts map={m.shortcuts} />}
        </>
      );
    }
  }
  return (
    <div className="lm pp" data-view={view}>
      <Header view={view} engine={m.engine} onOptions={a.options} />
      <div className="pp-body">{body}</div>
      {foot}
    </div>
  );
}
