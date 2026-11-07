import { useCallback, useEffect, useReducer } from "react";
import { Banner, Button, Modal } from "@speakkit/ui";
import type { EngineInfo } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { listFromHealth, type EngineAction } from "../../../shared/engines";
import { api, cleanError, Page, useVisible } from "../../ui";
import { performEngineAction } from "./actions";
import { EngineRow } from "./EngineRow";
import { enginesReducer, initEngines, pollMs } from "./model";

function RemoveDialog({ engine, onCancel, onConfirm }: { engine: EngineInfo | null; onCancel(): void; onConfirm(e: EngineInfo): void }) {
  return (
    <Modal
      open={!!engine}
      onClose={onCancel}
      title={`Remove ${engine?.name ?? "the engine"}?`}
      width={440}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm(engine!)}>
            Remove
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        Its files are deleted from this computer. Cloned voices made with it stop working until you install it again.
      </p>
    </Modal>
  );
}

/** Loads the list now and then keeps it fresh while the window is shown: quickly while something changes, slowly otherwise. */
function useEngineList(dispatch: (a: Parameters<typeof enginesReducer>[1]) => void, polling: number) {
  const visible = useVisible();
  const load = useCallback(async () => {
    try {
      dispatch({ type: "list", list: await api.engines() });
    } catch (e) {
      dispatch({ type: "list-failed", message: cleanError(e) });
    }
  }, [dispatch]);
  useEffect(() => {
    if (!visible) return;
    void load();
    const t = setInterval(load, polling);
    return () => clearInterval(t);
  }, [visible, polling, load]);
  return load;
}

/** Engines (G8, O2, O3): the server's engine list with state, memory behaviour and the actions that fit each state. */
export function EnginesPage({ s }: { s: AppState }) {
  const [st, dispatch] = useReducer(enginesReducer, undefined, initEngines);
  const load = useEngineList(dispatch, pollMs(st.list));
  const shown = st.list ?? listFromHealth(s.health);
  const run = async (e: EngineInfo, a: EngineAction) => {
    dispatch({ type: "busy", key: `${e.id}:${a}` });
    try {
      dispatch({ type: "action-done", list: await performEngineAction(e, a) });
    } catch (err) {
      dispatch({ type: "action-failed", message: cleanError(err) });
    } finally {
      dispatch({ type: "busy", key: null });
      void load();
    }
  };
  const onAction = (e: EngineInfo, a: EngineAction) => (a === "remove" ? dispatch({ type: "ask-remove", engine: e }) : void run(e, a));
  return (
    <Page title="Engines" lead="One heavy engine sits in memory at a time, and only while you need it.">
      {st.error && (st.list || shown) && (
        <Banner tone={st.list ? "error" : "warning"} title={st.list ? "That did not work" : "Showing the basics"}>
          {st.error}
        </Banner>
      )}
      <div className="lm-card" data-testid="engines">
        {shown?.engines.map((e) => (
          <EngineRow key={e.id} engine={e} active={shown.active === e.id} busy={st.busy} onAction={(a) => onAction(e, a)} />
        ))}
      </div>
      <RemoveDialog
        engine={st.removing}
        onCancel={() => dispatch({ type: "cancel-remove" })}
        onConfirm={(e) => {
          dispatch({ type: "cancel-remove" });
          void run(e, "remove");
        }}
      />
    </Page>
  );
}
