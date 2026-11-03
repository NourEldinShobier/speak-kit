import { createRoot } from "react-dom/client";
import { Button, ErrorBoundary, Logo, IconButton, ProgressBar, StatusPill } from "@speakkit/ui";
import "@speakkit/ui/lumen.css";
import "./float.css";
import { engineView } from "../shared/engine-view";
import { exportRunning } from "../shared/export";
import { showAccelerator } from "../shared/shortcuts";
import { clock } from "../shared/reader";
import { statusLine } from "./status-line";
import type { AppState } from "../shared/ipc";
import { api, playButton, useAppState } from "./ui";

function NowPlaying({ s }: { s: AppState }) {
  const r = s.reader;
  if (r.status === "idle") {
    return <p className="panel__empty">Nothing is playing. Select text in any app and press {showAccelerator(s.shortcuts.bindings["read-selection"], s.platform, "global")}.</p>;
  }
  return (
    <div className="panel__now" data-status={r.status}>
      <div className="panel__row">
        <div className="panel__txt">
          <b title={r.title} dir="auto">
            {r.title}
          </b>
          <span data-testid="panel-status">{statusLine(r)}</span>
        </div>
        <IconButton {...playButton(r.status)} onClick={() => api.reader({ type: "toggle" })} />
        <IconButton name="player-stop" label="Stop" onClick={() => api.reader({ type: "stop" })} />
      </div>
      <ProgressBar thin value={r.totalMs ? Math.min(100, (r.elapsedMs / r.totalMs) * 100) : 0} label="Reading progress" />
      <span className="panel__sub">{clock(Math.max(0, r.totalMs - r.elapsedMs))} left</span>
    </div>
  );
}

function RunningExports({ exports }: { exports: AppState["exports"] }) {
  if (exports.length === 0) return null;
  return (
    <section className="panel__sec" aria-label="Exports">
      <p className="sk-caps">Exporting</p>
      {exports.map((e) => (
        <div key={e.id} className="panel__exp">
          <span>{e.name}</span>
          <ProgressBar thin value={Math.round(e.progress * 100)} label={`Export ${e.name}`} />
        </div>
      ))}
    </section>
  );
}

/** Left click on the tray icon: what is playing, what is next, what is rendering, and the two actions people reach for. */
function Panel() {
  const s = useAppState();
  if (!s) return null;
  const r = s.reader;
  const v = engineView(s.health, s.serverError);
  const running = s.exports.filter(exportRunning);
  return (
    <div className="lm panel" data-testid="tray-panel">
      <header className="panel__head">
        <Logo size={20} />
        <b>Speak Kit</b>
        <StatusPill tone={v.tone} icon={v.spinner ? "loader-2" : undefined}>
          {v.label}
        </StatusPill>
        <span style={{ flex: 1 }} />
        <IconButton name="settings" label="Open Speak Kit" size={28} onClick={() => api.reader({ type: "open-app" })} />
      </header>
      <section className="panel__sec" aria-label="Now playing">
        <p className="sk-caps">Now playing</p>
        <NowPlaying s={s} />
      </section>
      {r.next && (
        <section className="panel__sec" aria-label="Next in queue">
          <p className="sk-caps">Next in queue</p>
          <p className="panel__next" dir="auto">
            {r.next}
          </p>
        </section>
      )}
      <RunningExports exports={running} />
      <footer className="panel__foot">
        <Button iconLeft="clipboard" onClick={() => api.readClipboard()}>
          Read clipboard
        </Button>
        <Button variant="primary" onClick={() => api.reader({ type: "open-app" })}>
          Open Speak Kit
        </Button>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Panel />
  </ErrorBoundary>,
);
