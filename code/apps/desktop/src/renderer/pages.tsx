import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  EmptyState,
  Icon,
  Segmented,
  SettingRow,
  SettingsSection,
  StatusPill,
  TextInput,
  type Tone,
} from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { AppState } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import { api, Page, TokenField, usePreview } from "./ui";

export const PreviewCtx = createContext<ReturnType<typeof usePreview> | null>(null);
export const usePlayer = () => useContext(PreviewCtx)!;

export const EngineBadge = ({ s }: { s: AppState }) => {
  const v = engineView(s.health, s.serverError);
  return (
    <StatusPill tone={v.tone} icon={v.spinner ? "loader-2" : undefined}>
      {v.label}
      {v.hint ? ` · ${v.hint}` : ""}
    </StatusPill>
  );
};

const dotClass = (tone: string) => (tone === "green" ? "" : tone === "red" ? "is-err" : tone === "neutral" ? "is-idle" : "is-warn");

export function Home({ s, go }: { s: AppState; go: (p: "engines" | "browser") => void }) {
  const eng = s.health?.engine;
  const v = engineView(s.health, s.serverError);
  const running = !!s.port && !!s.health;
  return (
    <Page title="Home" lead="SpeakKit runs a private voice server on this computer. Your browser extension talks to it.">
      {s.serverError && (
        <Banner tone="error" title="The server could not start" action={<Button size="sm" onClick={() => api.retryEngine()}>Retry</Button>}>
          {s.serverError}
        </Banner>
      )}
      {s.portFallback && (
        <Banner tone="warning" title={`Port ${s.config.preferredPort} is in use`}>
          SpeakKit is using {s.port} instead. Enter {s.port} in the extension options under Port.
        </Banner>
      )}
      <div className="sk-grid2">
        <div className="sk-stat" data-testid="server-status">
          <div className="sk-stat__k">Server</div>
          <div className="sk-stat__v">
            <span className={`sk-dot ${running ? "" : "is-err"}`} />
            {running ? "Running" : "Stopped"}
          </div>
          <div className="sk-stat__d">
            Listening on <code data-testid="server-address">127.0.0.1:{s.port || "-"}</code>
          </div>
        </div>
        <div className="sk-stat" data-testid="engine-status">
          <div className="sk-stat__k">Voice engine</div>
          <div className="sk-stat__v">
            <span className={`sk-dot ${dotClass(v.tone)}`} />
            {v.label}
          </div>
          <div className="sk-stat__d">
            {eng?.state === "downloading"
              ? `Downloading the model, ${Math.round((eng.progress ?? 0) * 100)}%`
              : eng?.state === "unloaded"
                ? "Kokoro-82M is on disk. It loads when you press play and unloads when idle."
                : (eng?.detail ?? "Kokoro-82M, runs on the CPU")}
            {eng?.state === "error" && (
              <>
                {" "}
                <Button size="sm" onClick={() => api.retryEngine()}>
                  Retry
                </Button>
              </>
            )}
            {eng?.state === "missing" && (
              <>
                {" "}
                <Button size="sm" onClick={() => api.downloadModel()}>
                  Download
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      <SettingsSection title="Pairing token" description="Paste this token in the extension under Options > General > Pairing token.">
        <div className="sk-pad">
          <TokenField token={s.token} regenerate />
        </div>
      </SettingsSection>
      <SettingsSection title="Install the extension" description="Add SpeakKit from the Chrome Web Store (also Edge and Brave). Then pin it to the toolbar.">
        <SettingRow
          label="SpeakKit for Chrome"
          description={s.pairing.lastSeenMs ? "Connected" : "Not connected yet"}
          control={
            <div className="sk-row-actions">
              <Button size="sm" onClick={() => go("browser")}>Pair</Button>
              <Button size="sm" iconLeft="external-link" onClick={() => api.openExternal("webstore")}>Open Web Store</Button>
            </div>
          }
        />
        <SettingRow label="Engines" description="Kokoro-82M is installed. Chatterbox comes later." control={<Button size="sm" onClick={() => go("engines")}>Manage</Button>} />
      </SettingsSection>
    </Page>
  );
}

const GRADE_TONE: Record<Voice["quality"], Tone> = { A: "green", B: "blue", C: "orange", D: "red" };
const AVATAR_TONES: Tone[] = ["blue", "orange", "green", "purple", "red", "yellow"];

export function Voices({ s }: { s: AppState }) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [def, setDef] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const { playing, error, toggle } = usePlayer();
  const ready = s.health?.engine.state;
  useEffect(() => {
    api
      .voices()
      .then((v) => {
        setVoices(v.voices);
        setDef(v.default);
        setErr("");
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, [ready === "ready" || ready === "unloaded", s.token]);
  const shown = useMemo(
    () =>
      voices.filter((v) => {
        if (q && !`${v.name} ${v.traits ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
        return filter === "all" || filter === v.lang || filter === v.gender;
      }),
    [voices, q, filter],
  );
  return (
    <Page title="Voices" lead={`${voices.length} Kokoro voices. Press Preview to hear one.`} wide>
      {(err || error) && <Banner tone="error">{error || err}</Banner>}
      <div className="sk-tools">
        <TextInput icon="search" size="sm" aria-label="Search voices" placeholder="Search voices" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented
          label="Filter voices"
          value={filter}
          onChange={setFilter}
          items={[
            { id: "all", label: "All" },
            { id: "en-US", label: "US English" },
            { id: "en-GB", label: "UK English" },
            { id: "female", label: "Female" },
            { id: "male", label: "Male" },
          ]}
        />
      </div>
      {voices.length === 0 && !err ? (
        <EmptyState icon="microphone" title="No voices yet">
          Voices appear when the engine has been downloaded.
        </EmptyState>
      ) : (
        <div className="sk-voices" data-testid="voices">
          {shown.map((v) => {
            const on = playing === v.id;
            return (
              <div key={v.id} className="sk-voice" data-voice={v.id}>
                <div className="sk-voice__h">
                  <Avatar name={v.name} tone={AVATAR_TONES[voices.indexOf(v) % AVATAR_TONES.length]} />
                  <div style={{ flex: 1 }}>
                    <b>
                      {v.name}
                      {v.id === def && <Badge>Default</Badge>}
                    </b>
                    <small>
                      {v.lang === "en-US" ? "US English" : "UK English"} · {v.gender === "female" ? "Female" : "Male"}
                    </small>
                  </div>
                </div>
                <div className="sk-voice__t">{v.traits}</div>
                <div className="sk-voice__f">
                  <Button
                    size="sm"
                    variant={on ? "primary" : "secondary"}
                    iconLeft={on ? "player-stop" : "player-play"}
                    aria-label={`${on ? "Stop" : "Preview"} ${v.name}`}
                    onClick={() => toggle(v.id, `Hello, I am ${v.name}. This is how I sound when reading to you.`)}
                  >
                    {on ? "Stop" : "Preview"}
                  </Button>
                  <StatusPill tone={GRADE_TONE[v.quality]}>Grade {v.quality}</StatusPill>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

export function Engines({ s }: { s: AppState }) {
  const v = engineView(s.health, s.serverError);
  const e = s.health?.engine;
  return (
    <Page title="Engines" lead="One heavy engine sits in memory at a time, and only while you need it.">
      <div>
        <p className="sk-caps">Installed</p>
        <div className="lm-card" data-testid="engines">
          <div className="sk-engine" data-engine="kokoro">
            <span className="sk-tile"><Icon name="cpu" size={18} /></span>
            <div className="sk-engine__body">
              <b>Kokoro-82M</b>
              <span>Natural English voices, runs on the CPU, about one second to the first word.</span>
              {e?.state === "unloaded" && <span>Not in memory. It loads when you press play.</span>}
              {e?.state === "downloading" && <span>Downloading, {Math.round((e.progress ?? 0) * 100)}%</span>}
              {e?.state === "error" && <span>{e.detail}</span>}
            </div>
            <div className="sk-row-actions">
              <EngineBadge s={s} />
              {v.key === "missing" && <Button size="sm" onClick={() => api.downloadModel()}>Download</Button>}
              {v.key === "error" && <Button size="sm" onClick={() => api.retryEngine()}>Retry</Button>}
            </div>
          </div>
        </div>
      </div>
      <div>
        <p className="sk-caps">Coming later</p>
        <div className="lm-card">
          <div className="sk-engine" data-engine="chatterbox" style={{ opacity: 0.7 }}>
            <span className="sk-tile"><Icon name="sparkles" size={18} /></span>
            <div className="sk-engine__body">
              <b>Chatterbox</b>
              <span>Expressive voices with emotion control and voice cloning. Needs a GPU and about 2.4 GB.</span>
            </div>
            <StatusPill>Not available yet</StatusPill>
          </div>
        </div>
      </div>
    </Page>
  );
}

export function BrowserPage({ s }: { s: AppState }) {
  const paired = !!s.pairing.lastSeenMs;
  return (
    <Page title="Browser" lead="Connect Chrome, Edge or Brave to the voice engine on this computer." wide>
      <div className="sk-accent-card">
        <h3>Pair your browser</h3>
        <ol className="sk-steps">
          <li>
            <b>Install</b> SpeakKit from the Chrome Web Store, then pin it from the puzzle menu.
          </li>
          <li>
            <b>Copy</b> the token below.
          </li>
          <li>
            <b>Paste</b> it in the extension under Options &gt; General &gt; Pairing token.
          </li>
        </ol>
        <TokenField token={s.token} regenerate confirmRegenerate />
        <div className="sk-row-actions">
          <Button iconLeft="external-link" onClick={() => api.openExternal("webstore")}>Open Web Store</Button>
        </div>
      </div>
      <div>
        <p className="sk-caps">Paired</p>
        <div className="lm-card">
          <SettingRow
            label="Chrome extension"
            description={paired ? `Last call ${new Date(s.pairing.lastSeenMs!).toLocaleTimeString()}${s.pairing.origin ? `, ${s.pairing.origin}` : ""}` : "No call from an extension yet. It appears here after the first request."}
            control={<StatusPill tone={paired ? "green" : "neutral"} icon={paired ? "circle-check" : undefined}>{paired ? "Connected" : "Waiting"}</StatusPill>}
          />
          <SettingRow label="Connection" description="Connected over this computer only (127.0.0.1)." control={<code>127.0.0.1:{s.port || "-"}</code>} />
        </div>
      </div>
      <Banner tone="info">Page text is treated as information, never as instructions. The token never leaves this computer.</Banner>
    </Page>
  );
}

