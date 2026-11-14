import { useEffect, useState } from "react";
import { Button, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState, Metrics } from "../../../shared/ipc";
import { engineView } from "../../../shared/engine-view";
import { IDLE_CHOICES, type IdleChoice } from "../../../shared/schemas";
import { EngineBadge } from "../../pages";
import { api, Page, useVisible } from "../../ui";
import { ResourcesSections } from "./ResourcesSection";
import { change } from "../../change";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";
import { activeLocale, at } from "../../../shared/i18n";

const IDLE_LABEL = { "1": "s.mem.idle1", "5": "s.mem.idle5", "15": "s.mem.idle15", never: "s.mem.never" } as const satisfies Record<IdleChoice, string>;

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
  if (v.key === "ready" && unloadAtMs) return at("s.mem.unloadsAt", { time: new Date(unloadAtMs).toLocaleTimeString(activeLocale()) });
  if (v.key === "unloaded") return at("s.mem.zero");
  return v.hint ?? "Kokoro-82M";
}

function RightNow({ s }: { s: AppState }) {
  const { t } = useT();
  const m = useMetrics();
  const v = engineView(s.health, s.serverError);
  return (
    <SettingsSection title={t("s.mem.rightNow")}>
      <SettingRow
        className={v.key === "unloaded" ? "lm-row--control" : undefined}
        label={t("s.about.engine")}
        description={engineNote(v, s.health?.engine.idleUnloadAtMs)}
        control={
          <div className="sk-row-actions">
            <span data-testid="memory-engine">
              <EngineBadge s={s} />
            </span>
            {v.key === "unloaded" && <Button onClick={() => api.warmEngine()}>{t("s.mem.loadNow")}</Button>}
          </div>
        }
      />
      <SettingRow label={t("s.mem.inUse")} description={t("s.mem.inUseHint")} control={<span data-testid="memory-rss">{m ? `${Math.round(m.totalMb)} MB` : "..."}</span>} />
    </SettingsSection>
  );
}

function Unloading({ s }: { s: AppState }) {
  const { t } = useT();
  const c = s.config;
  return (
    <SettingsSection title={t("s.mem.unloading")}>
      <SettingRow
        className="lm-row--control"
        label={t("s.mem.unloadIdle")}
        description={t("s.mem.unloadIdleHint")}
        control={
          <Select
            label={t("s.mem.idleSelect")}
            value={c.idleUnload}
            onChange={(x) => change({ idleUnload: x as IdleChoice })}
            options={IDLE_CHOICES.map((x) => ({ value: x, label: t(IDLE_LABEL[x]) }))}
          />
        }
      />
      <SettingRow
        label={t("s.mem.startup")}
        description={t("s.mem.startupHint")}
        control={<Toggle aria-label={t("s.mem.startup")} checked={c.loadAtStart} onChange={(x) => change({ loadAtStart: x })} />}
      />
      <SettingRow
        label={t("s.mem.battery")}
        description={t(s.onBattery ? "s.mem.batteryOn" : "s.mem.batteryOff")}
        control={<Toggle aria-label={t("s.mem.battery")} checked={c.batterySaver} onChange={(x) => change({ batterySaver: x })} />}
      />
    </SettingsSection>
  );
}

export function MemoryPage({ s }: { s: AppState }) {
  const { t } = useT();
  return (
    <Page title={t("s.mem.title")} lead={t("s.mem.lead")}>
      <RightNow s={s} />
      <Unloading s={s} />
      <ResourcesSections />
    </Page>
  );
}
