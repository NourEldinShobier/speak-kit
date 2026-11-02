import { useEffect, useState } from "react";
import { Button, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState, Metrics } from "../../../shared/ipc";
import { engineView } from "../../../shared/engine-view";
import { IDLE_CHOICES, type IdleChoice } from "../../../shared/schemas";
import { EngineBadge } from "../../pages";
import { api, Page, useVisible } from "../../ui";

const IDLE_LABEL: Record<IdleChoice, string> = { "1": "After 1 minute", "5": "After 5 minutes", "15": "After 15 minutes", never: "Never" };

/** Process memory, polled every 2 s while the window is visible. */
function useMetrics(): Metrics | null {
  const visible = useVisible();
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    if (!visible) return; // hidden window: no polling
    let on = true;
    const tick = () =>
      api.metrics().then(
        (x) => on && setM(x),
        () => {},
      );
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [visible]);
  return m;
}

function engineNote(v: ReturnType<typeof engineView>, unloadAtMs: number | undefined): string {
  if (v.key === "ready" && unloadAtMs) return `Unloads at ${new Date(unloadAtMs).toLocaleTimeString()} if idle`;
  if (v.key === "unloaded") return "0 MB in memory. Wakes on play.";
  return v.hint ?? "Kokoro-82M";
}

function RightNow({ s }: { s: AppState }) {
  const m = useMetrics();
  const v = engineView(s.health, s.serverError);
  return (
    <SettingsSection title="Right now">
      <SettingRow
        label="Voice engine"
        description={engineNote(v, s.health?.engine.idleUnloadAtMs)}
        control={
          <div className="sk-row-actions">
            <span data-testid="memory-engine">
              <EngineBadge s={s} />
            </span>
            {v.key === "unloaded" && (
              <Button size="sm" onClick={() => api.warmEngine()}>
                Load now
              </Button>
            )}
          </div>
        }
      />
      <SettingRow label="Memory in use" description="All Speak Kit processes, this window included." control={<span data-testid="memory-rss">{m ? `${Math.round(m.totalMb)} MB` : "..."}</span>} />
    </SettingsSection>
  );
}

function Unloading({ s }: { s: AppState }) {
  const c = s.config;
  return (
    <SettingsSection title="Unloading">
      <SettingRow
        label="Unload the model when idle"
        description="Frees its memory after the last reading. The next play loads it again in a moment."
        control={
          <Select label="Idle unload" value={c.idleUnload} onChange={(x) => api.patchConfig({ idleUnload: x as IdleChoice })} options={IDLE_CHOICES.map((x) => ({ value: x, label: IDLE_LABEL[x] }))} />
        }
      />
      <SettingRow
        label="Load at startup"
        description="Keep the model ready as soon as Speak Kit starts. Uses memory all day."
        control={<Toggle aria-label="Load at startup" checked={c.loadAtStart} onChange={(x) => api.patchConfig({ loadAtStart: x })} />}
      />
      <SettingRow
        label="Battery saver"
        description={s.onBattery ? "On battery now: the model unloads sooner." : "On battery, the model unloads sooner."}
        control={<Toggle aria-label="Battery saver" checked={c.batterySaver} onChange={(x) => api.patchConfig({ batterySaver: x })} />}
      />
    </SettingsSection>
  );
}

export function MemoryPage({ s }: { s: AppState }) {
  return (
    <Page title="Memory" lead="The voice model uses several hundred MB while loaded. Speak Kit loads it when you play and unloads it when idle.">
      <RightNow s={s} />
      <Unloading s={s} />
    </Page>
  );
}
