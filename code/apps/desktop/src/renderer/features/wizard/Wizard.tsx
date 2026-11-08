import { useReducer } from "react";
import type { AppState } from "../../../shared/ipc";
import { ConnectStep } from "./ConnectStep";
import { DoneStep } from "./DoneStep";
import { DownloadStep } from "./DownloadStep";
import { initWizard, wizardReducer } from "./model";
import { WelcomeStep } from "./WelcomeStep";

/** First-run setup: welcome, download, browser, done. */
export function Wizard({ s }: { s: AppState }) {
  const [st, dispatch] = useReducer(wizardReducer, undefined, initWizard);
  switch (st.step) {
    case 0:
      return <WelcomeStep onNext={() => dispatch({ type: "go", step: 1 })} />;
    case 1:
      return <DownloadStep s={s} onBack={() => dispatch({ type: "go", step: 0 })} onNext={() => dispatch({ type: "go", step: 2 })} />;
    case 2:
      return (
        <ConnectStep
          s={s}
          copied={st.copied}
          onCopied={() => dispatch({ type: "copied" })}
          onBack={() => dispatch({ type: "go", step: 1 })}
          onSkip={() => dispatch({ type: "finish-connect", skipped: true })}
          onNext={() => dispatch({ type: "finish-connect", skipped: false })}
        />
      );
    case 3:
      return <DoneStep s={s} skipped={st.skipped} onBack={() => dispatch({ type: "go", step: 2 })} />;
    default: {
      const unreachable: never = st.step;
      return unreachable;
    }
  }
}
