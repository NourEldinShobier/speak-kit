import type { ModelCard, SpeechModelsView } from "../../../shared/speech-models/contract";
import { Button, SettingRow } from "@speakkit/ui";
import { models } from "./api";
import { figureText, languageName, sampleText, secondsText, sizeText } from "../../speech-text";
import type { Run } from "./run";

export function DiskSpace({ v, run, onDelete }: { v: SpeechModelsView; run: Run; onDelete(c: ModelCard): void }) {
  const have = v.models.filter((m) => m.diskBytes > 0 && !m.fileMissing);
  return (
    <section className="sk-engines-section" aria-labelledby="disk-h">
      <div className="sk-engines-section__head">
        <h2 id="disk-h">Disk space</h2>
        <span>{sizeText(v.disk.total)} used by models</span>
      </div>
      <div className="lm-card">
        {have.length === 0 ? (
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

/** "Parakeet v3, under a second" / "Whisper Large v3 Turbo, about 90 seconds": what runs without a card, and what that costs for ten seconds of speech. */
function cpuText(v: SpeechModelsView, r: SpeechModelsView["table"][number]): string {
  if (!r.cpuOnly) return "Not measured";
  const name = v.names[r.cpuOnly] ?? r.cpuOnly;
  return r.cpuSeconds === undefined ? name : `${name}, ${secondsText(r.cpuSeconds).toLowerCase()}`;
}

export function LanguageTable({ v }: { v: SpeechModelsView }) {
  const alsoText = (row: SpeechModelsView["table"][number]) => {
    if (row.alsoWorks.length > 0) return row.alsoWorks.map((id) => v.names[id] ?? id).join(", ");
    return row.language === "auto" ? "No other model detects the language" : `No other model speaks ${languageName(row.language)}`;
  };
  return (
    <section className="sk-engines-section" aria-labelledby="table-h">
      <h2 id="table-h">Best model for each language</h2>
      <p className="sk-engines-section__lead">
        Speak Kit picks from this table when you choose a dictation language. The pick is the smallest download that was as accurate as the best and quick enough here.
      </p>
      <div className="lm-card sk-table-wrap">
        <table className="sk-table">
          <thead>
            <tr>
              <th scope="col">Language</th>
              <th scope="col">Recommended</th>
              <th scope="col">Wrong words in our test</th>
              <th scope="col">Without a graphics card</th>
              <th scope="col">Also works</th>
            </tr>
          </thead>
          <tbody>
            {v.table.map((r) => (
              <tr key={r.language}>
                <th scope="row">{languageName(r.language)}</th>
                <td>{v.names[r.recommended] ?? r.recommended}</td>
                <td>{r.figure ? figureText(r.figure) : "Not measured in this language"}</td>
                <td>{cpuText(v, r)}</td>
                <td>{alsoText(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sk-engines-section__foot">{sampleText(v.sample)}</p>
    </section>
  );
}
