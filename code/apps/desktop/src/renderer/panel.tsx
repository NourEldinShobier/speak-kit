import { createRoot } from "react-dom/client";
import { Button, Logo, IconButton, ProgressBar, StatusPill } from "@speakkit/ui";
import "@speakkit/ui/lumen.css";
import "./float.css";
import { engineView } from "../shared/engine-view";
import { exportRunning } from "../shared/export";
import { clock, statusLine } from "../shared/reader";
import { api, useAppState, useTheme } from "./ui";

/** Left click on the tray icon: what is playing, what is next, what is rendering, and the two actions people reach for. */
function Panel() {
  const s = useAppState();
  useTheme(s?.config.theme);
  if (!s) return null;
  const r = s.reader;
  const v = engineView(s.health, s.serverError);
  const active = r.status === "playing" || r.status === "preparing";
  const reading = r.status !== "idle";
  const running = s.exports.filter(exportRunning);
  return (
    <div className="lm panel" data-testid="tray-panel">
      <header className="panel__head">
        <Logo size={18} />
        <b>SpeakKit</b>
        <StatusPill tone={v.tone} icon={v.spinner ? "loader-2" : undefined}>
          {v.label}
        </StatusPill>
        <span style={{ flex: 1 }} />
        <IconButton name="settings" label="Open SpeakKit" size={28} onClick={() => api.reader({ type: "open-app" })} />
      </header>
      <section className="panel__sec" aria-label="Now playing">
        <p className="sk-caps">Now playing</p>
        {reading ? (
          <div className="panel__now" data-status={r.status}>
            <div className="panel__row">
              <div className="panel__txt">
                <b title={r.title}>{r.title}</b>
                <span data-testid="panel-status">{statusLine(r)}</span>
              </div>
              <IconButton
                name={r.status === "finished" ? "refresh" : active ? "player-pause" : "player-play"}
                label={r.status === "finished" ? "Read again" : active ? "Pause" : "Play"}
                onClick={() => api.reader({ type: "toggle" })}
              />
              <IconButton name="player-stop" label="Stop" onClick={() => api.reader({ type: "stop" })} />
            </div>
            <ProgressBar thin value={r.totalMs ? Math.min(100, (r.elapsedMs / r.totalMs) * 100) : 0} label="Reading progress" />
            <span className="panel__sub">{clock(Math.max(0, r.totalMs - r.elapsedMs))} left</span>
          </div>
        ) : (
          <p className="panel__empty">Nothing is playing. Select text in any app and press {s.shortcuts.bindings["read-selection"]}.</p>
        )}
      </section>
      {r.next && (
        <section className="panel__sec" aria-label="Next in queue">
          <p className="sk-caps">Next in queue</p>
          <p className="panel__next">{r.next}</p>
        </section>
      )}
      {running.length > 0 && (
        <section className="panel__sec" aria-label="Exports">
          <p className="sk-caps">Exporting</p>
          {running.map((e) => (
            <div key={e.id} className="panel__exp">
              <span>{e.name}</span>
              <ProgressBar thin value={Math.round(e.progress * 100)} label={`Export ${e.name}`} />
            </div>
          ))}
        </section>
      )}
      <footer className="panel__foot">
        <Button iconLeft="clipboard" onClick={() => api.readClipboard()}>
          Read clipboard
        </Button>
        <Button variant="primary" onClick={() => api.reader({ type: "open-app" })}>
          Open SpeakKit
        </Button>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Panel />);
