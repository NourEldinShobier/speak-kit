import { Banner, Button, SettingRow, SettingsSection } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { dictation } from "./api";

/** What the card says above the row, or null when there is nothing to say: no model yet, a failure (with another try), or the chosen model not loaded yet. */
function NoticeBanner({ status }: { status: DictationStatus }) {
  const chosen = status.models.find((m) => m.selected) ?? status.models[0]!;
  if (status.modelError)
    return (
      <Banner tone="error" title="The speech model could not be set up" action={<Button onClick={() => void dictation.downloadModel(chosen.id)}>Try again</Button>}>
        {status.modelError}
      </Banner>
    );
  if (status.models.some((m) => m.progress)) return null;
  if (!chosen.installed)
    return (
      <Banner tone="info" title={status.models.some((m) => m.installed) ? `${chosen.name} is not on this computer` : "Choose a speech model"}>
        {status.models.some((m) => m.installed)
          ? "Download it on the Models tab, or pick one that is installed."
          : "Dictation needs a speech model on this computer. Download one on the Models tab; it works offline afterwards."}
      </Banner>
    );
  if (status.enabled && !status.modelReady)
    return (
      <Banner tone="info" title={`${chosen.name} is not loaded`}>
        It loads by itself when you dictate, or when you turn dictation on. The first words can take a few seconds.
      </Banner>
    );
  return null;
}

/** The notice in a padded strip, so the banner does not touch the card's edges. */
function Notice({ status }: { status: DictationStatus }) {
  const banner = NoticeBanner({ status });
  return banner && <div className="dict-model__notice">{banner}</div>;
}

/** The speech model in use and the way to the Models tab, where models are chosen, downloaded and removed. */
export function SpeechModelRow({ status, change }: { status: DictationStatus; change: () => void }) {
  const chosen = status.models.find((m) => m.selected) ?? status.models[0]!;
  return (
    <SettingsSection title="Speech model">
      <Notice status={status} />
      <SettingRow className="lm-row--control" label={chosen.name} description="Used for dictation." control={<Button onClick={change}>Change</Button>} />
    </SettingsSection>
  );
}
