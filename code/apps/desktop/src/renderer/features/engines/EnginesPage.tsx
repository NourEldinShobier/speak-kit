import { Page } from "../../ui";
import { SpeechModelsSection } from "./SpeechModels";

/** Engines: the speech models of dictation with their performance and disk space. */
export function EnginesPage() {
  return (
    <Page title="Engines" lead="Speech models turn what you say into text. Everything runs on this computer.">
      <SpeechModelsSection />
    </Page>
  );
}
