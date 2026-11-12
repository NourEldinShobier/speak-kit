import { lazy, Suspense, useReducer } from "react";
import type { AppState } from "../../../shared/ipc";
import { api } from "../../ui";
import { ConnectStep } from "./ConnectStep";
import { DoneStep } from "./DoneStep";
import { DownloadStep } from "./DownloadStep";
import { initWizard, wizardReducer, type WizardAction, type WizardStep } from "./model";
import { WelcomeStep } from "./WelcomeStep";

// The dictation step pulls in the dictation and engines code: it loads when setup gets there.
const DictationStep = lazy(() => import("./DictationStep").then((m) => ({ default: m.DictationStep })));

/** First-run setup: welcome, download, dictation, browser, done. Closing the window keeps the step, so setup opens again where it stopped. */
export function Wizard({ s }: { s: AppState }) {
  const resumed = s.config.setupStep === 2;
  const [st, dispatch] = useReducer(wizardReducer, s.config.setupStep as WizardStep, initWizard);
  const go = (step: WizardStep) => {
    void api.patchConfig({ setupStep: step });
    dispatch({ type: "go", step });
  };
  const send = (a: WizardAction) => dispatch(a);
  switch (st.step) {
    case 0:
      return <WelcomeStep onNext={() => go(1)} />;
    case 1:
      return <DownloadStep s={s} onBack={() => go(0)} onNext={() => go(2)} />;
    case 2:
      return (
        <Suspense fallback={null}>
          <DictationStep resumed={resumed} onBack={() => go(1)} onNext={() => go(3)} />
        </Suspense>
      );
    case 3:
      return (
        <ConnectStep
          s={s}
          copied={st.copied}
          onCopied={() => send({ type: "copied" })}
          onBack={() => go(2)}
          onSkip={() => (void api.patchConfig({ setupStep: 4 }), send({ type: "finish-connect", skipped: true }))}
          onNext={() => (void api.patchConfig({ setupStep: 4 }), send({ type: "finish-connect", skipped: false }))}
        />
      );
    case 4:
      return <DoneStep s={s} skipped={st.skipped} onBack={() => go(3)} />;
    default: {
      const unreachable: never = st.step;
      return unreachable;
    }
  }
}
