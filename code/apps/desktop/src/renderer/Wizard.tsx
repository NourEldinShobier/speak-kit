import { useEffect, useState, type ReactNode } from "react";
import { Banner, Button, Icon, LoadingLabel, ProgressBar, SettingRow, SettingsSection, Stepper, StatusPill, Toggle, type IconName } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { api, Logo, TokenField, usePreview } from "./ui";

const STEPS = ["Welcome", "Voice engine", "Download", "Connect browser", "Done"];
const MODEL_MB = 177;

/** Setup window (Lumen X9-X14): title bar 32, stepper 52, 720 px column, footer 64 with Back left and the primary action right. */
function Frame({
  at,
  title,
  sub,
  foot,
  children,
  center,
}: {
  at: number;
  title: string;
  sub: ReactNode;
  foot: ReactNode;
  children?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className="sk-setup">
      <div className="sk-setup__title">
        <Logo size={16} />
        Set up SpeakKit
      </div>
      <div className="sk-setup__stepper">
        <Stepper steps={STEPS} current={at} />
      </div>
      <div className="sk-setup__col">
        {center && (
          <div className="sk-center">
            <Logo size={72} />
          </div>
        )}
        <h1 style={center ? { textAlign: "center", fontSize: 28 } : undefined}>{title}</h1>
        <p style={center ? { textAlign: "center" } : undefined}>{sub}</p>
        {children}
      </div>
      <div className="sk-setup__foot">{foot}</div>
    </div>
  );
}

const Foot = ({ back, children }: { back?: ReactNode; children: ReactNode }) => (
  <>
    <div>{back}</div>
    <div>{children}</div>
  </>
);
const Back = ({ onClick, label = "Back" }: { onClick(): void; label?: string }) => (
  <Button variant="ghost" iconLeft="arrow-left" onClick={onClick}>
    {label}
  </Button>
);

export function Wizard({ s }: { s: AppState }) {
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const eng = s.health?.engine;

  if (step === 0)
    return (
      <Frame
        at={0}
        center
        title="Read anything out loud."
        sub="On your own computer. No account, no cloud, no limits."
        foot={
          <Foot>
            <span style={{ color: "var(--text-tertiary)" }}>Setup takes about 3 minutes</span>
            <Button variant="primary" size="lg" iconRight="arrow-right" onClick={() => setStep(1)}>
              Get started
            </Button>
          </Foot>
        }
      >
        <div className="sk-feats">
          {(
            [
              ["lock", "Private", "Text never leaves this device"],
              ["bolt", "Fast", "Starts speaking in about a second"],
              ["world", "Everywhere", "Web pages, PDFs, any text"],
            ] as [IconName, string, string][]
          ).map(([i, t, d]) => (
            <div key={t} className="sk-feat">
              <Icon name={i} size={18} />
              <b>{t}</b>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </Frame>
    );

  if (step === 1)
    return (
      <Frame
        at={1}
        title="Choose a voice engine"
        sub="You can add or switch engines any time in Engines."
        foot={
          <Foot back={<Back onClick={() => setStep(0)} />}>
            <Button
              variant="primary"
              size="lg"
              iconLeft="download"
              onClick={() => {
                void api.downloadModel();
                setStep(2);
              }}
            >
              Download Kokoro
            </Button>
          </Foot>
        }
      >
        <Banner tone="info" icon="cpu">
          Kokoro runs on the CPU, so any PC works. No GPU is needed.
        </Banner>
        <SettingsSection title="Engines">
          <button className="sk-radio is-sel" role="radio" aria-checked="true" aria-label="Kokoro-82M">
            <span className="sk-tile"><Icon name="cpu" size={18} /></span>
            <span className="sk-engine__body">
              <b>Kokoro-82M</b>
              <span>Natural English voices, 28 to choose from. About 1 second to the first word.</span>
              <span>Download {MODEL_MB} MB · runs on any PC</span>
            </span>
            <StatusPill tone="green">Recommended</StatusPill>
          </button>
          <button className="sk-radio" disabled aria-label="Chatterbox, not available yet">
            <span className="sk-tile"><Icon name="sparkles" size={18} /></span>
            <span className="sk-engine__body">
              <b>Chatterbox</b>
              <span>Expressive, with emotion control and voice cloning.</span>
              <span>Not available yet. It arrives in a later version.</span>
            </span>
            <StatusPill>Optional</StatusPill>
          </button>
        </SettingsSection>
      </Frame>
    );

  if (step === 2) {
    const failed = eng?.state === "error" || !!s.serverError;
    const ready = eng?.state === "ready" || eng?.state === "unloaded";
    const pct = ready ? 1 : Math.min(1, Math.max(0, eng?.progress ?? 0));
    const detail = s.serverError ?? eng?.detail ?? "";
    return (
      <Frame
        at={2}
        title={failed ? "Download paused" : ready ? "Kokoro-82M is ready" : "Downloading Kokoro-82M"}
        sub={
          failed
            ? `The download stopped at ${Math.round(pct * 100)}%. Everything downloaded so far is kept.`
            : ready
              ? "Everything is on this computer. SpeakKit works fully offline."
              : "One time only. After this, SpeakKit works fully offline."
        }
        foot={
          <Foot back={<Back label="Cancel" onClick={() => setStep(1)} />}>
            {failed ? (
              <Button variant="primary" size="lg" iconLeft="refresh" onClick={() => api.retryEngine()}>
                Retry download
              </Button>
            ) : (
              <Button variant="primary" size="lg" iconRight="arrow-right" onClick={() => setStep(3)}>
                {ready ? "Continue" : "Continue in background"}
              </Button>
            )}
          </Foot>
        }
      >
        <div data-testid="download">
          <SettingsSection title="Model">
            <SettingRow
              label="kokoro-82m (q8)"
              description={ready ? `${MODEL_MB} MB, done` : `${Math.round(pct * MODEL_MB)} MB of ${MODEL_MB} MB`}
              control={
                failed ? (
                  <StatusPill tone="orange" icon="alert-triangle">Paused</StatusPill>
                ) : ready ? (
                  <StatusPill tone="green" icon="circle-check">Done</StatusPill>
                ) : (
                  <StatusPill tone="blue" icon="loader-2">{eng?.state === "loading" ? "Loading" : `${Math.round(pct * 100)}%`}</StatusPill>
                )
              }
            />
            <div style={{ padding: "0 14px 14px" }}>
              <ProgressBar value={pct * 100} label="Download progress" />
            </div>
          </SettingsSection>
        </div>
        {failed && (
          <Banner tone="warning" title="Lost the connection to the model server">
            Check your internet connection, then retry. Downloading resumes where it stopped.
            {detail && <> Details: <code>{detail}</code></>}
          </Banner>
        )}
        {!failed && !ready && <p style={{ margin: 0, color: "var(--text-secondary)" }}>Continue in the background to set up your browser now. The download finishes on its own.</p>}
      </Frame>
    );
  }

  if (step === 3)
    return <Connect s={s} copied={copied} onCopied={() => setCopied(true)} onBack={() => setStep(2)} onSkip={() => { setSkipped(true); setStep(4); }} onNext={() => { setSkipped(false); setStep(4); }} />;

  return <Done s={s} skipped={skipped} onBack={() => setStep(3)} />;
}

function Connect({ s, copied, onCopied, onBack, onSkip, onNext }: { s: AppState; copied: boolean; onCopied(): void; onBack(): void; onSkip(): void; onNext(): void }) {
  const [testStart, setTestStart] = useState<number | null>(null);
  const connected = testStart !== null && (s.pairing.lastSeenMs ?? 0) >= testStart;
  const paired = !!s.pairing.lastSeenMs;
  return (
    <Frame
      at={3}
      title="Connect your browser"
      sub="Install the extension, paste the token, then test the connection."
      foot={
        <Foot back={<Back onClick={onBack} />}>
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button variant="primary" size="lg" iconRight="arrow-right" disabled={!(copied || paired)} onClick={onNext}>
            Continue
          </Button>
        </Foot>
      }
    >
      <SettingsSection title="1. Install the extension" description="Add SpeakKit from the Chrome Web Store. It also installs in Edge and Brave. Then pin it from the puzzle menu.">
        <SettingRow label="SpeakKit for Chrome" control={<Button iconLeft="external-link" onClick={() => api.openExternal("webstore")}>Open Web Store</Button>} />
      </SettingsSection>
      <SettingsSection title="2. Pair it with this app" description="Copy the token and paste it in the extension under Options > General > Pairing token.">
        <div className="sk-pad">
          <TokenField token={s.token} regenerate confirmRegenerate onCopied={onCopied} />
        </div>
      </SettingsSection>
      <SettingsSection title="3. Test the connection">
        <SettingRow
          label={connected ? "Connected" : testStart !== null ? "Waiting for the extension's first call" : "Check that the extension reaches this app"}
          description={`Listening on 127.0.0.1:${s.port || "?"}. If Windows asks about the firewall, choose Private networks or Cancel; SpeakKit only listens on 127.0.0.1.`}
          control={
            connected ? (
              <StatusPill tone="green" icon="circle-check">Connected</StatusPill>
            ) : testStart !== null ? (
              <LoadingLabel>Waiting</LoadingLabel>
            ) : (
              <Button onClick={() => setTestStart(Date.now())}>Test connection</Button>
            )
          }
        />
      </SettingsSection>
    </Frame>
  );
}

function Done({ s, skipped, onBack }: { s: AppState; skipped: boolean; onBack(): void }) {
  const [voice, setVoice] = useState("");
  const { playing, error, toggle } = usePreview();
  useEffect(() => {
    api.voices().then((v) => { setVoice(v.default); }, () => {});
  }, [s.health?.engine.state]);
  const text = "Notes, documents and even voices lived on someone else's server, rented back to us by the month.";
  const on = playing === voice && !!voice;
  return (
    <Frame
      at={4}
      title={skipped ? "Setup is finished" : "You're all set"}
      sub={skipped ? "You can connect the browser extension later from Browser." : "Kokoro is ready. Press play to hear your voice."}
      foot={
        <Foot back={<Back onClick={onBack} />}>
          <Button variant="primary" size="lg" iconRight="arrow-right" onClick={() => api.patchConfig({ setupDone: true, setupSkipped: skipped })}>
            Open SpeakKit
          </Button>
        </Foot>
      }
    >
      <Banner tone="info" icon={skipped ? "info-circle" : "circle-check"} title={skipped ? "Browser extension not connected" : "Server is running"}>
        {skipped ? "Pair it later under Browser." : `Listening on 127.0.0.1:${s.port}`}
      </Banner>
      <SettingsSection title="Hear it">
        <SettingRow
          label="Play sample"
          description={`“${text}”`}
          control={
            <Button variant="primary" iconLeft={on ? "player-stop" : "player-play"} disabled={!voice} aria-label={on ? "Stop sample" : "Play sample"} onClick={() => toggle(voice, text)}>
              {on ? "Stop" : "Play"}
            </Button>
          }
        />
      </SettingsSection>
      {error && <Banner tone="error">{error}</Banner>}
      <SettingsSection title="Handy to know">
        <SettingRow label="Tray icon" description="SpeakKit lives in the system tray. Windows 11 may hide it under the arrow; drag the icon out to keep it in view. Closing the window keeps it running." />
        <SettingRow label="Launch at login" description="Start SpeakKit when you sign in to Windows." control={<Toggle aria-label="Launch at login" checked={s.launchAtLogin} onChange={(v) => api.setLaunchAtLogin(v)} />} />
      </SettingsSection>
    </Frame>
  );
}
