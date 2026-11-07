import { Banner, Button, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { DOT_CLASS, engineDetail, engineView } from "../shared/engine-view";
import { errorText } from "./error-text";
import { api, Page, TokenField } from "./ui";

function ServerAlerts({ s }: { s: AppState }) {
  return (
    <>
      {s.serverError && (
        <Banner
          tone="error"
          title="The server could not start"
          action={
            <Button size="sm" onClick={() => api.retryEngine()}>
              Retry
            </Button>
          }
        >
          {errorText(s.serverError)}
        </Banner>
      )}
      {s.portFallback && (
        <Banner tone="warning" title={`Port ${s.config.preferredPort} is in use`}>
          Speak Kit is using {s.port} instead. Enter {s.port} in the extension options under Port.
        </Banner>
      )}
    </>
  );
}

function ServerStat({ s }: { s: AppState }) {
  const running = !!s.port && !!s.health;
  return (
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
  );
}

function EngineStat({ s }: { s: AppState }) {
  const eng = s.health?.engine;
  const v = engineView(s.health, s.serverError);
  return (
    <div className="sk-stat" data-testid="engine-status">
      <div className="sk-stat__k">Voice engine</div>
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
  );
}

function InstallSection({ s, go }: { s: AppState; go: (p: "engines" | "browser") => void }) {
  return (
    <SettingsSection title="Install the extension" description="Add Speak Kit from the Chrome Web Store (also Edge and Brave). Then pin it to the toolbar.">
      <SettingRow
        label="Speak Kit for Chrome"
        description={s.pairing.lastSeenMs ? "Connected" : "Not connected yet"}
        control={
          <div className="sk-row-actions">
            <Button size="sm" onClick={() => go("browser")}>
              Pair
            </Button>
            <Button size="sm" iconLeft="external-link" onClick={() => api.openExternal("webstore")}>
              Open Web Store
            </Button>
          </div>
        }
      />
      <SettingRow
        label="Engines"
        description="Kokoro-82M is the default voice. Chatterbox, an optional second voice for NVIDIA graphics cards, can be added here."
        control={
          <Button size="sm" onClick={() => go("engines")}>
            Manage
          </Button>
        }
      />
    </SettingsSection>
  );
}

export function Home({ s, go }: { s: AppState; go: (p: "engines" | "browser") => void }) {
  return (
    <Page title="Home" lead="Speak Kit runs a private voice server on this computer. Your browser extension talks to it.">
      <ServerAlerts s={s} />
      <div className="sk-grid2">
        <ServerStat s={s} />
        <EngineStat s={s} />
      </div>
      <SettingsSection title="Pairing token" description="Paste this token in the extension under Options > General > Pairing token.">
        <div className="sk-pad">
          <TokenField token={s.token} regenerate />
        </div>
      </SettingsSection>
      <InstallSection s={s} go={go} />
    </Page>
  );
}
