import { Badge, Banner, Button, Icon, ProgressBar, Radio, SettingsSection } from "@speakkit/ui";
import type { DictationStatus, ModelView } from "../../../shared/dictation/contract";
import { dictation, patchDictation } from "./api";
import { downloadText, modelLine } from "./model";

function Right({ m }: { m: ModelView }) {
  if (m.progress) return <Button onClick={() => void dictation.cancelDownload()}>Cancel</Button>;
  if (m.installed)
    return (
      <span className="dict-installed">
        <Icon name="check" size={14} /> Installed
      </span>
    );
  return <Button onClick={() => void dictation.downloadModel(m.id)}>Download</Button>;
}

function ModelRow({ m }: { m: ModelView }) {
  const busy = m.progress;
  return (
    <div className="lm-row dict-model" data-testid={`model-${m.id}`}>
      <Radio name="dictation-model" aria-label={m.name} checked={m.selected && m.installed} disabled={!m.installed} onChange={() => void patchDictation({ model: m.id })} />
      <div className="lm-row__text">
        <div className="lm-row__label">
          {m.name}
          {m.id === "large-v3-turbo-q5_0" && <Badge>Recommended</Badge>}
          <Badge>{m.tag}</Badge>
        </div>
        {busy ? (
          <>
            <ProgressBar block thin value={busy.kind === "downloading" ? Math.round(busy.fraction * 100) : undefined} label={`${m.name} download`} className="dict-model__bar" />
            <div className="lm-row__desc">{busy.kind === "downloading" ? downloadText(m) : "Getting the model ready. This takes a few seconds."}</div>
          </>
        ) : (
          <div className="lm-row__desc">{modelLine(m)}</div>
        )}
      </div>
      <div className="lm-row__control">
        <Right m={m} />
      </div>
    </div>
  );
}

/** "1 more model is on the Engines page." */
export const moreLine = (n: number): string => (n === 1 ? "1 more model is on the Engines page." : `${n} more models are on the Engines page.`);

/** What the card says above the list, or null when there is nothing to say: no model yet, a failure (with another try), or the chosen model not loaded yet. */
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
          ? "Download it below, or pick one that is installed."
          : "Dictation needs a speech model on this computer. Download one below; it works offline afterwards."}
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

/** Speech model card: pick an installed model, download another, or cancel a download. It sits at the top of the page, since dictation needs a model first. */
export function ModelList({ status }: { status: DictationStatus }) {
  const shown = status.models.filter((m) => !m.more || m.installed || m.selected || m.progress);
  return (
    <SettingsSection title="Speech model">
      <Notice status={status} />
      {shown.map((m) => (
        <ModelRow key={m.id} m={m} />
      ))}
      {shown.length < status.models.length && <p className="lm-row__desc dict-model__more">{moreLine(status.models.length - shown.length)}</p>}
    </SettingsSection>
  );
}
