import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Icon, Modal, ProgressBar, StatusPill } from "@speakkit/ui";
import type { EngineInfo, EngineList } from "@speakkit/protocol";
import type { AppState } from "../shared/ipc";
import { describeEngine, listFromHealth, type EngineAction } from "../shared/engines";
import { api, cleanError, Page, useVisible } from "./ui";

const BLURB: Record<string, string> = {
  kokoro: "Natural English voices, runs on the CPU, about one second to the first word.",
  chatterbox: "Expressive voices with emotion control and voice cloning. Needs a GPU and about 2.4 GB.",
};

/** Engines (G8, O2, O3): the server's engine list with state, memory behaviour and the actions that fit each state. */
export function EnginesPage({ s }: { s: AppState }) {
  const visible = useVisible();
  const [list, setList] = useState<EngineList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<EngineInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.engines());
      setError(null);
    } catch (e) {
      setList(null);
      setError(cleanError(e));
    }
  }, []);
  // Refresh while the window is shown: quickly while something is changing, slowly otherwise. Nothing runs when hidden.
  const changing = !!list?.engines.some((e) => e.state === "loading" || e.state === "downloading" || e.state === "installing");
  useEffect(() => {
    if (!visible) return;
    void load();
    const t = setInterval(load, changing ? 1000 : 5000);
    return () => clearInterval(t);
  }, [visible, changing, load]);

  const shown = list ?? listFromHealth(s.health);
  const run = async (e: EngineInfo, a: EngineAction) => {
    setBusy(`${e.id}:${a}`);
    try {
      if (a === "download" || a === "retry") await (a === "retry" ? api.retryEngine() : api.downloadModel());
      else if (a === "load") await api.warmEngine();
      else if (a === "install") setList(await api.installEngine(e.id));
      else if (a === "use") setList(await api.selectEngine(e.id));
      else if (a === "remove") setList(await api.removeEngine(e.id));
      setError(null);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(null);
      void load();
    }
  };
  const label: Record<EngineAction, string> = { download: "Download", install: "Install", load: "Load now", retry: "Retry", use: "Use this engine", remove: "Remove" };

  return (
    <Page title="Engines" lead="One heavy engine sits in memory at a time, and only while you need it.">
      {error && !list && shown && (
        <Banner tone="warning" title="Showing the basics">
          {error}
        </Banner>
      )}
      {error && list && (
        <Banner tone="error" title="That did not work">
          {error}
        </Banner>
      )}
      <div className="lm-card" data-testid="engines">
        {shown?.engines.map((e) => {
          const active = shown.active === e.id;
          const d = describeEngine(e, active);
          return (
            <div key={e.id} className="sk-engine" data-engine={e.id} data-state={e.state}>
              <span className="sk-tile">
                <Icon name={e.id === "kokoro" ? "cpu" : "sparkles"} size={18} />
              </span>
              <div className="sk-engine__body">
                <b>
                  {e.name}
                  {active && <span className="sk-active"> · In use</span>}
                </b>
                <span>{BLURB[e.id]}</span>
                {e.gpu && (
                  <span>
                    Found {e.gpu.name}, {Math.round(e.gpu.vramMb / 1024)} GB
                  </span>
                )}
                {d.note && <span data-testid={`engine-note-${e.id}`}>{d.note}</span>}
                {d.progress !== null && <ProgressBar thin value={Math.round(d.progress * 100)} label={`${e.name} progress`} />}
              </div>
              <div className="sk-row-actions">
                <StatusPill tone={d.pill.tone} icon={d.pill.spinner ? "loader-2" : undefined}>
                  {d.pill.label}
                </StatusPill>
                {d.actions.map((a) => (
                  <Button key={a} size="sm" variant={a === "remove" ? "danger" : "secondary"} loading={busy === `${e.id}:${a}`} onClick={() => (a === "remove" ? setRemoving(e) : run(e, a))}>
                    {label[a]}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? "the engine"}?`}
        width={440}
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="danger"
              solid
              onClick={() => {
                const e = removing!;
                setRemoving(null);
                void run(e, "remove");
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="sk-modal-text" style={{ margin: 0 }}>
          Its files are deleted from this computer. Cloned voices made with it stop working until you install it again.
        </p>
      </Modal>
    </Page>
  );
}
