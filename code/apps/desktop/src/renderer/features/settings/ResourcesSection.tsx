import { useCallback, useEffect, useState } from "react";
import { Banner, Button, SettingRow, SettingsSection } from "@speakkit/ui";
import { deviceLines, modelText, type Resources } from "../../../shared/settings/resources";
import { api, useVisible } from "../../ui";
import { rowAttr } from "./focus";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";

type Reading = { kind: "loading" } | { kind: "error" } | { kind: "ready"; r: Resources };

/** What each process and model holds, read every 3 s while the window is visible (a hidden window does not poll). */
function useResources(): { reading: Reading; retry(): void } {
  const visible = useVisible();
  const [reading, setReading] = useState<Reading>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let on = true;
    let pending = false; // a slow reading is not stacked under the next tick
    const tick = () => {
      if (pending) return;
      pending = true;
      void api
        .resources()
        .then(
          (r) => on && setReading({ kind: "ready", r }),
          () => on && setReading((was) => (was.kind === "ready" ? was : { kind: "error" })),
        )
        .finally(() => (pending = false));
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [visible, nonce]);
  return {
    reading,
    retry: useCallback(() => {
      setReading({ kind: "loading" });
      setNonce((n) => n + 1);
    }, []),
  };
}

const mb = (n: number) => `${Math.round(n)} MB`;

function Processes({ r }: { r: Resources }) {
  const { t } = useT();
  return (
    <SettingsSection title={t("s.mem.byProcess")}>
      {r.rows.length === 0 ? (
        <SettingRow label={t("s.mem.noProc")} description={t("s.mem.noProcHint")} />
      ) : (
        r.rows.map((row) => <SettingRow key={row.label} label={row.label} description={t("s.mem.cpu", { cpu: row.cpu })} control={<span data-testid={`resource-${row.label}`}>{mb(row.mb)}</span>} />)
      )}
    </SettingsSection>
  );
}

/** Performance, Resources: memory of every Speak Kit process and of both models, and what this computer offers. */
export function ResourcesSections() {
  const { t } = useT();
  const { reading, retry } = useResources();
  if (reading.kind === "loading")
    return (
      <SettingsSection title={t("s.mem.resources")}>
        <SettingRow label={t("s.mem.reading")} description={t("s.mem.readingHint")} />
      </SettingsSection>
    );
  if (reading.kind === "error")
    return (
      <SettingsSection title={t("s.mem.resources")}>
        <Banner tone="error" title={t("s.mem.readFailed")} action={<Button onClick={retry}>{t("common.tryAgain")}</Button>}>
          {t("s.mem.readFailedHint")}
        </Banner>
      </SettingsSection>
    );
  const { r } = reading;
  return (
    <>
      <SettingsSection title={t("s.mem.models")}>
        {r.models.map((m) => (
          <SettingRow
            key={m.kind}
            {...rowAttr(`performance/${m.kind}-model`)}
            label={m.name}
            description={t(m.kind === "voice" ? "s.mem.voiceKind" : "s.mem.speechKind")}
            control={<span data-testid={`model-${m.kind}`}>{modelText(m)}</span>}
          />
        ))}
        <SettingRow label={t("s.mem.all")} description={t("s.mem.allHint")} control={<span data-testid="resource-total">{mb(r.totalMb)}</span>} />
      </SettingsSection>
      <Processes r={r} />
      <SettingsSection title={t("s.diag.computer")}>
        {deviceLines(r.device).map((l, i) => (
          <SettingRow key={l.label} {...(i === 0 ? rowAttr("performance/device") : {})} label={l.label} control={<span data-testid={`device-${i}`}>{l.value}</span>} />
        ))}
      </SettingsSection>
    </>
  );
}
