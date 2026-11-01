import { useReducer } from "react";
import type { AppState } from "../../../shared/ipc";
import { ConnectStep } from "./ConnectStep";
import { DoneStep } from "./DoneStep";
import { DownloadStep } from "./DownloadStep";
import { EngineStep } from "./EngineStep";
import { initWizard, wizardReducer } from "./model";
import { WelcomeStep } from "./WelcomeStep";

/** First-run setup: welcome, engine, download, browser, done. */
export function Wizard({ s }: { s: AppState }) {
  const [st, dispatch] = useReducer(wizardReducer, undefined, initWizard);
  switch (st.step) {
    case 0:
      return <WelcomeStep onNext={() => dispatch({ type: "go", step: 1 })} />;
    case 1:
      return <EngineStep onBack={() => dispatch({ type: "go", step: 0 })} onDownload={() => dispatch({ type: "go", step: 2 })} />;
    case 2:
      return <DownloadStep s={s} onBack={() => dispatch({ type: "go", step: 1 })} onNext={() => dispatch({ type: "go", step: 3 })} />;
    case 3:
      return (
        <ConnectStep
          s={s}
          copied={st.copied}
          onCopied={() => dispatch({ type: "copied" })}
          onBack={() => dispatch({ type: "go", step: 2 })}
          onSkip={() => dispatch({ type: "finish-connect", skipped: true })}
          onNext={() => dispatch({ type: "finish-connect", skipped: false })}
        />
      );
    case 4:
      return <DoneStep s={s} skipped={st.skipped} onBack={() => dispatch({ type: "go", step: 3 })} />;
    default: {
      const unreachable: never = st.step;
      return unreachable;
    }
  }
}
