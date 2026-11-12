import { Badge, Button, Icon, ProgressBar, Radio, SettingsSection } from "@speakkit/ui";
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
          {m.id === "large-v3-turbo-q5_0" && <Badge>Default</Badge>}
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

/** Speech model card: pick an installed model, download another, or cancel a download. */
export function ModelList({ status }: { status: DictationStatus }) {
  const shown = status.models.filter((m) => !m.more || m.installed || m.selected || m.progress);
  return (
    <SettingsSection title="Speech model">
      {shown.map((m) => (
        <ModelRow key={m.id} m={m} />
      ))}
      {shown.length < status.models.length && <p className="lm-row__desc dict-model__more">{moreLine(status.models.length - shown.length)}</p>}
    </SettingsSection>
  );
}
