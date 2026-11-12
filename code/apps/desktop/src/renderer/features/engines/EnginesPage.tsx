import { useCallback, useEffect, useReducer } from "react";
import { Banner } from "@speakkit/ui";
import type { EngineInfo } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { listFromHealth, type EngineAction } from "../../../shared/engines";
import { api, cleanError, Page, useVisible } from "../../ui";
import { performEngineAction } from "./actions";
import { EngineRow } from "./EngineRow";
import { enginesReducer, initEngines, pollMs } from "./model";
import { SpeechModelsSection } from "./SpeechModels";

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

/** Engines: the server's engine list with state, memory behaviour and the actions that fit each state. */
export function EnginesPage({ s }: { s: AppState }) {
  const [st, dispatch] = useReducer(enginesReducer, undefined, initEngines);
  const load = useEngineList(dispatch, pollMs(st.list));
  const shown = st.list ?? listFromHealth(s.health);
  const run = async (e: EngineInfo, a: EngineAction) => {
    dispatch({ type: "busy", key: `${e.id}:${a}` });
    try {
      await performEngineAction(a);
      dispatch({ type: "action-done" });
    } catch (err) {
      dispatch({ type: "action-failed", message: cleanError(err) });
    } finally {
      dispatch({ type: "busy", key: null });
      void load();
    }
  };
  return (
    <Page title="Engines" lead="Voice engines read text aloud. Speech models turn what you say into text. Everything runs on this computer.">
      {st.error && (st.list || shown) && (
        <Banner tone={st.list ? "error" : "warning"} title={st.list ? "That did not work" : "Showing the basics"}>
          {st.error}
        </Banner>
      )}
      <section className="sk-engines-section" aria-labelledby="voice-h">
        <h2 id="voice-h">Voice engine</h2>
        <div className="lm-card sk-engines" data-testid="engines">
          {shown?.engines.map((e) => (
            <EngineRow key={e.id} engine={e} busy={st.busy} onAction={(a) => void run(e, a)} />
          ))}
        </div>
      </section>
      <SpeechModelsSection />
    </Page>
  );
}
