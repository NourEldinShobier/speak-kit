import type { ModelCard, SpeechModelsView } from "../../../shared/speech-models/contract";
import { Button, SettingRow } from "@speakkit/ui";
import { models } from "./api";
import { sizeText } from "../../speech-text";
import type { Run } from "./run";

export function DiskSpace({ v, run, onDelete, onDeleteWriter }: { v: SpeechModelsView; run: Run; onDelete(c: ModelCard): void; onDeleteWriter(): void }) {
  const have = v.models.filter((m) => m.diskBytes > 0 && !m.fileMissing);
  const writer = v.writer.diskBytes > 0 ? v.writer : undefined;
  return (
    <section className="sk-engines-section" aria-labelledby="disk-h">
      <div className="sk-engines-section__head">
        <h2 id="disk-h">Disk space</h2>
        <span>{sizeText(v.disk.total)} used by models</span>
      </div>
      <div className="lm-card">
        {have.length === 0 && !writer ? (
          <SettingRow label="No models on disk" description="Downloaded models appear here." />
        ) : (
          have.map((m) => (
            <SettingRow
              key={m.id}
              className="lm-row--control"
              label={m.name}
              description={`Speech model, ${sizeText(m.diskBytes)}.`}
              control={
                <Button variant="danger" aria-label={`Delete ${m.name}`} onClick={() => onDelete(m)}>
                  Delete
                </Button>
              }
            />
          ))
        )}
        {writer ? (
          <SettingRow
            className="lm-row--control"
            label={writer.name}
            description={`Writer model of the rewrite pass, ${sizeText(writer.diskBytes)}.`}
            control={
              <Button variant="danger" aria-label={`Delete ${writer.name}`} onClick={onDeleteWriter}>
                Delete
              </Button>
            }
          />
        ) : null}
      </div>
      <p className="sk-engines-section__foot">
        Models are stored in {v.disk.folder}.{" "}
        <button type="button" className="sk-link" onClick={() => run(() => models.openModelsFolder())}>
          Show folder
        </button>
      </p>
    </section>
  );
}
