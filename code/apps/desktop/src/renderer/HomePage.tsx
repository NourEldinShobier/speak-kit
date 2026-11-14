import { Banner, Button, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { DOT_CLASS, engineDetail, engineView } from "../shared/engine-view";
import { errorText } from "./error-text";
import { useT } from "./i18n";
import { api, Page } from "./ui";
import { TokenField } from "./TokenField";

function ServerAlerts({ s }: { s: AppState }) {
  const { t } = useT();
  return (
    <>
      {s.serverError && (
        <Banner
          tone="error"
          title={t("home.serverFailed")}
          action={
            <Button size="sm" onClick={() => api.retryEngine()}>
              {t("home.retry")}
            </Button>
          }
        >
          {errorText(s.serverError)}
        </Banner>
      )}
      {s.portFallback && (
        <Banner tone="warning" title={t("home.portBusy", { port: String(s.config.preferredPort) })}>
          {t("home.portBusyBody", { actual: String(s.port) })}
        </Banner>
      )}
    </>
  );
}

function ServerStat({ s }: { s: AppState }) {
  const { t } = useT();
  const running = !!s.port && !!s.health;
  return (
    <div className="sk-stat" data-testid="server-status">
      <div className="sk-stat__k">{t("home.server")}</div>
      <div className="sk-stat__v">
        <span className={`sk-dot ${running ? "" : "is-err"}`} />
        {running ? t("home.running") : t("home.stopped")}
      </div>
      <div className="sk-stat__d">
        {t("home.listening")} <code data-testid="server-address">127.0.0.1:{s.port || "-"}</code>
      </div>
    </div>
  );
}

function EngineStat({ s }: { s: AppState }) {
  const { t } = useT();
  const eng = s.health?.engine;
  const v = engineView(s.health, s.serverError);
  return (
    <div className="sk-stat" data-testid="engine-status">
      <div className="sk-stat__k">{t("home.engine")}</div>
      <div className="sk-stat__v">
        <span className={`sk-dot ${DOT_CLASS[v.tone]}`} />
        {v.label}
      </div>
      <div className="sk-stat__d">
        {engineDetail(eng)}
        {eng?.state === "error" && (
          <>
            {" "}
            <Button size="sm" onClick={() => api.retryEngine()}>
              {t("home.retry")}
            </Button>
          </>
        )}
        {eng?.state === "missing" && (
          <>
            {" "}
            <Button size="sm" onClick={() => api.downloadModel()}>
              {t("home.download")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function InstallSection({ s, go }: { s: AppState; go: (p: "engines" | "browser") => void }) {
  const { t } = useT();
  return (
    <SettingsSection title={t("home.installTitle")} description={t("home.installDesc")}>
      <SettingRow
        label={t("home.chrome")}
        description={s.pairing.lastSeenMs ? t("home.connected") : t("home.notConnected")}
        control={
          <div className="sk-row-actions">
            <Button size="sm" onClick={() => go("browser")}>
              {t("home.pair")}
            </Button>
            <Button size="sm" iconLeft="external-link" onClick={() => api.openExternal("webstore")}>
              {t("home.openStore")}
            </Button>
          </div>
        }
      />
      <SettingRow
        label={t("home.engines")}
        description={t("home.enginesDesc")}
        control={
          <Button size="sm" onClick={() => go("engines")}>
            {t("home.manage")}
          </Button>
        }
      />
    </SettingsSection>
  );
}

export function Home({ s, go }: { s: AppState; go: (p: "engines" | "browser") => void }) {
  const { t } = useT();
  return (
    <Page title={t("page.home")} lead={t("home.lead")}>
      <ServerAlerts s={s} />
      <div className="sk-grid2">
        <ServerStat s={s} />
        <EngineStat s={s} />
      </div>
      <SettingsSection title={t("home.tokenTitle")} description={t("home.tokenDesc")}>
        <div className="sk-pad">
          <TokenField token={s.token} regenerate />
        </div>
      </SettingsSection>
      <InstallSection s={s} go={go} />
    </Page>
  );
}
