import { useEffect, useState } from "react";
import { type IconName, Banner, Button, Segmented, Select, SettingRow, SettingsSection, Slider, StatusPill, TextInput, Toggle } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { AppState, Metrics, SettingsSub, StorageInfo } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import { IDLE_CHOICES, type IdleChoice } from "../shared/schemas";
import { api, formatBytes, Page, TokenField, useVisible } from "./ui";
import { EngineBadge } from "./pages";

export const SETTINGS_NAV: { group: string; items: { id: SettingsSub; label: string; icon: IconName }[] }[] = [
  { group: "General", items: [{ id: "general", label: "General", icon: "settings" }, { id: "voice", label: "Voice and playback", icon: "volume" }] },
  { group: "Device", items: [{ id: "memory", label: "Memory", icon: "cpu" }, { id: "storage", label: "Storage", icon: "folder" }] },
  { group: "App", items: [{ id: "browser", label: "Browser integration", icon: "world" }, { id: "about", label: "About", icon: "info-circle" }] },
];

const IDLE_LABEL: Record<IdleChoice, string> = { "1": "After 1 minute", "5": "After 5 minutes", "15": "After 15 minutes", never: "Never" };

function General({ s }: { s: AppState }) {
  const c = s.config;
  return (
    <Page title="General" lead="Startup, language and notifications.">
      <SettingsSection title="Startup">
        <SettingRow label="Launch at login" description="Start SpeakKit when you sign in so the extension is ready." control={<Toggle aria-label="Launch at login" checked={s.launchAtLogin} onChange={(v) => api.setLaunchAtLogin(v)} />} />
        <SettingRow label="Start minimized to tray" description="When it starts at login, stay in the tray instead of opening a window." control={<Toggle aria-label="Start minimized to tray" checked={c.startMinimized} onChange={(v) => api.patchConfig({ startMinimized: v })} />} />
      </SettingsSection>
      <SettingsSection title="Appearance">
        <SettingRow label="Language" control={<Select label="Language" value={c.language} onChange={(v) => api.patchConfig({ language: v as "system" | "en" })} options={[{ value: "system", label: "System default" }, { value: "en", label: "English" }]} />} />
        <SettingRow
          label="Theme"
          control={<Segmented label="Theme" value={c.theme} onChange={(v) => api.patchConfig({ theme: v as "system" | "light" | "dark" })} items={[{ id: "system", label: "System" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }]} />}
        />
      </SettingsSection>
      <SettingsSection title="Notifications" description="Native notifications have no buttons; clicking one opens SpeakKit.">
        <SettingRow label="Model download finished" control={<Toggle aria-label="Notify when the model download finishes" checked={c.notifyDownload} onChange={(v) => api.patchConfig({ notifyDownload: v })} />} />
        <SettingRow label="Engine errors" control={<Toggle aria-label="Notify on engine errors" checked={c.notifyError} onChange={(v) => api.patchConfig({ notifyError: v })} />} />
      </SettingsSection>
    </Page>
  );
}

function VoicePage({ s }: { s: AppState }) {
  const [voices, setVoices] = useState<Voice[]>([]);
  useEffect(() => {
    api.voices().then((v) => setVoices(v.voices), () => {});
  }, [s.health?.engine.state === "missing", s.token]);
  return (
    <Page title="Voice and playback" lead="Used for previews in this app. The extension keeps its own voice and speed.">
      <SettingsSection title="Preview">
        <SettingRow
          label="Voice"
          control={
            <Select
              label="Preview voice"
              value={s.config.voice}
              onChange={(v) => api.patchConfig({ voice: v })}
              options={voices.length ? voices.map((v) => ({ value: v.id, label: v.name })) : [{ value: s.config.voice, label: s.config.voice }]}
            />
          }
        />
        <SettingRow
          label="Speed"
          description={`${s.config.speed.toFixed(2)}x`}
          control={<Slider aria-label="Preview speed" min={0.5} max={2} step={0.05} value={s.config.speed} onChange={(v) => api.patchConfig({ speed: v })} />}
        />
      </SettingsSection>
    </Page>
  );
}

function Memory({ s }: { s: AppState }) {
  const c = s.config;
  const visible = useVisible();
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    if (!visible) return; // hidden window: no polling
    let on = true;
    const tick = () => api.metrics().then((x) => on && setM(x), () => {});
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [visible]);
  const v = engineView(s.health, s.serverError);
  const at = s.health?.engine.idleUnloadAtMs;
  return (
    <Page title="Memory" lead="The voice model uses several hundred MB while loaded. SpeakKit loads it when you play and unloads it when idle.">
      <SettingsSection title="Right now">
        <SettingRow label="Voice engine" description={v.key === "ready" && at ? `Unloads at ${new Date(at).toLocaleTimeString()} if idle` : v.hint ?? "Kokoro-82M"} control={<span data-testid="memory-engine"><EngineBadge s={s} /></span>} />
        <SettingRow label="Memory in use" description="All SpeakKit processes, this window included." control={<span data-testid="memory-rss">{m ? `${Math.round(m.totalMb)} MB` : "..."}</span>} />
      </SettingsSection>
      <SettingsSection title="Unloading">
        <SettingRow
          label="Unload the model when idle"
          description="Frees its memory after the last reading. The next play loads it again in a moment."
          control={<Select label="Idle unload" value={c.idleUnload} onChange={(x) => api.patchConfig({ idleUnload: x as IdleChoice })} options={IDLE_CHOICES.map((x) => ({ value: x, label: IDLE_LABEL[x] }))} />}
        />
        <SettingRow label="Load at startup" description="Keep the model ready as soon as SpeakKit starts. Uses memory all day." control={<Toggle aria-label="Load at startup" checked={c.loadAtStart} onChange={(x) => api.patchConfig({ loadAtStart: x })} />} />
        <SettingRow label="Battery saver" description={s.onBattery ? "On battery now: the model unloads sooner." : "On battery, the model unloads sooner."} control={<Toggle aria-label="Battery saver" checked={c.batterySaver} onChange={(x) => api.patchConfig({ batterySaver: x })} />} />
      </SettingsSection>
    </Page>
  );
}

function BrowserSettings({ s }: { s: AppState }) {
  const [port, setPort] = useState(String(s.config.preferredPort));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(port);
  const valid = Number.isInteger(n) && n >= 1024 && n <= 65535;
  const paired = !!s.pairing.lastSeenMs;
  const apply = async () => {
    setBusy(true);
    try {
      await api.setPort(n);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title="Browser integration" lead="How the extension finds and trusts this app.">
      {s.portFallback && <Banner tone="warning" title={`Port ${s.config.preferredPort} is busy`}>Using {s.port} for now. Enter {s.port} in the extension.</Banner>}
      <SettingsSection title="Connection">
        <SettingRow
          label="Server port"
          description="The extension connects here. Default 47615. If it is busy, the next free port is used."
          control={
            <div className="sk-row-actions">
              <TextInput size="sm" aria-label="Server port" inputMode="numeric" value={port} error={!valid ? "1024 to 65535" : err || undefined} onChange={(e) => setPort(e.target.value)} style={{ width: 96 }} />
              <Button disabled={!valid || busy || n === s.config.preferredPort} loading={busy} onClick={apply}>Apply</Button>
            </div>
          }
        />
        <SettingRow label="Paired browser" description={paired ? `Last call ${new Date(s.pairing.lastSeenMs!).toLocaleTimeString()}` : "No extension has called yet."} control={<StatusPill tone={paired ? "green" : "neutral"}>{paired ? "Connected" : "Waiting"}</StatusPill>} />
      </SettingsSection>
      <SettingsSection title="Pairing token" description="Regenerating signs out every paired browser.">
        <div className="sk-pad">
          <TokenField token={s.token} regenerate confirmRegenerate />
        </div>
      </SettingsSection>
    </Page>
  );
}

function Storage() {
  const [st, setSt] = useState<StorageInfo | null>(null);
  useEffect(() => {
    api.storage().then(setSt, () => {});
  }, []);
  const total = st ? st.modelsBytes + st.logsBytes + st.otherBytes : 0;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : "0%");
  const rows: [string, number, string][] = st
    ? [
        ["Voice models", st.modelsBytes, "var(--tag-blue)"],
        ["Logs", st.logsBytes, "var(--tag-orange)"],
        ["Settings and token", st.otherBytes, "var(--tag-purple)"],
      ]
    : [];
  return (
    <Page title="Storage" lead={st ? `On this computer: ${formatBytes(total)}` : "Measuring..."}>
      <SettingsSection title="Models folder" description={st?.modelsDir}>
        <div className="sk-pad" data-testid="storage-bar">
          <div className="sk-bar">
            {st && rows.map(([k, n]) => <i key={k} style={{ width: pct(n) }} />)}
          </div>
        </div>
        {rows.map(([k, n, color]) => (
          <SettingRow key={k} label={<><span className="sk-sw" style={{ background: color }} />{k}</>} control={<span>{formatBytes(n)}</span>} />
        ))}
        <SettingRow label="Open folder" control={<div className="sk-row-actions"><Button size="sm" iconLeft="folder" onClick={() => api.openPath("models")}>Models</Button><Button size="sm" iconLeft="folder" onClick={() => api.openPath("logs")}>Logs</Button></div>} />
      </SettingsSection>
    </Page>
  );
}

const LICENSES: [string, string][] = [
  ["Kokoro-82M (model)", "Apache-2.0"],
  ["onnxruntime-node", "MIT"],
  ["Electron", "MIT"],
  ["React", "MIT"],
  ["Radix UI", "MIT"],
  ["Tabler Icons", "MIT"],
  ["valibot", "MIT"],
  ["electron-log, electron-store", "MIT"],
];

function About({ s }: { s: AppState }) {
  return (
    <Page title="About" lead="SpeakKit reads text out loud on your own computer.">
      <SettingsSection title="Versions">
        <SettingRow label="SpeakKit" control={<span data-testid="about-version">{s.version}</span>} />
        <SettingRow label="Voice engine" control={<span>Kokoro-82M</span>} />
        <SettingRow label="Platform" control={<span>{s.platform}</span>} />
      </SettingsSection>
      <SettingsSection title="Open source licenses">
        {LICENSES.map(([k, l]) => (
          <SettingRow key={k} label={k} control={<span>{l}</span>} />
        ))}
      </SettingsSection>
      <div><Button iconLeft="folder" onClick={() => api.openPath("logs")}>Open log folder</Button></div>
    </Page>
  );
}

export function Settings({ s, sub }: { s: AppState; sub: SettingsSub }) {
  switch (sub) {
    case "voice":
      return <VoicePage s={s} />;
    case "memory":
      return <Memory s={s} />;
    case "browser":
      return <BrowserSettings s={s} />;
    case "storage":
      return <Storage />;
    case "about":
      return <About s={s} />;
    default:
      return <General s={s} />;
  }
}
