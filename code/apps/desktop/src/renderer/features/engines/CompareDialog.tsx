import { useState } from "react";
import { Button, Checkbox, Modal, Select } from "@speakkit/ui";
import type { ModelCard, SpeechModelsView } from "../../../shared/speech-models/contract";
import { compareLanguages, compareTable, defaultCompare, languageName, MAX_COMPARED, sampleText, togglePicked } from "../../speech-text";

/** The test language the table starts with: the one asked for, else the dictation language, else the first one any model was measured in. */
function testLanguage(asked: string | null, languages: readonly string[], dictation: string): string {
  if (asked && languages.includes(asked)) return asked;
  if (languages.includes(dictation)) return dictation;
  return languages[0] ?? "en";
}

function Picker({ cards, ids, onPick }: { cards: ModelCard[]; ids: string[]; onPick(ids: string[]): void }) {
  return (
    <fieldset className="sk-compare-pick">
      <legend>Models to compare (up to {MAX_COMPARED})</legend>
      {cards.map((c) => (
        <Checkbox key={c.id} label={c.name} checked={ids.includes(c.id)} disabled={!ids.includes(c.id) && ids.length >= MAX_COMPARED} onChange={() => onPick(togglePicked(ids, c.id))} />
      ))}
    </fieldset>
  );
}

function Table({ cards, language }: { cards: ModelCard[]; language: string }) {
  const t = compareTable(cards, language);
  return (
    <div className="sk-compare" role="region" aria-label="Model comparison" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col" aria-label="Fact" />
            {t.names.map((n) => (
              <th key={n} scope="col">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {r.cells.map((c, i) => (
                <td key={t.names[i]}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The models side by side: the person picks up to four, and one test language for the wrong-word figures. */
export function CompareDialog({ open, v, cards, onClose }: { open: boolean; v: SpeechModelsView; cards: ModelCard[]; onClose(): void }) {
  const [picked, setPicked] = useState<string[] | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const ids = (picked ?? defaultCompare(cards)).filter((id) => cards.some((c) => c.id === id));
  const languages = compareLanguages(cards);
  const test = testLanguage(asked, languages, v.dictationLanguage);
  const footer = (
    <Button data-autofocus onClick={onClose}>
      Close
    </Button>
  );
  return (
    <Modal open={open} onClose={onClose} title="Compare models" width={720} footer={footer}>
      <Picker cards={cards} ids={ids} onPick={setPicked} />
      <p className="sk-compare-pick__lead">Test language for the accuracy row</p>
      <Select label="Test language" value={test} onChange={setAsked} options={languages.map((c) => ({ value: c, label: languageName(c) }))} />
      <Table cards={cards.filter((c) => ids.includes(c.id))} language={test} />
      <p className="sk-modal-text">{sampleText(v.sample)} Wrong-word figures are for one test language at a time; compare them only within it.</p>
    </Modal>
  );
}
