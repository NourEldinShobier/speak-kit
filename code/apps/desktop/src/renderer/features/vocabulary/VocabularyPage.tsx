import { useState } from "react";
import { takeVocabularyTab, type VocabularyTab } from "../../vocabulary-tab";
import { exportVocabulary, importVocabulary, type ExportFormat } from "@speakkit/dictation";
import { Banner, Button, DropdownMenu, DropdownMenuItem, Modal, Segmented } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { Page } from "../../ui";
import { dictation, patchDictation } from "../dictation-bridge";
import { useDictation } from "../dictation-bridge";
import { HeardAs } from "./HeardAs";
import { importView, type ImportView } from "./model";
import { ReadAs } from "./ReadAs";
import "./vocabulary.css";

const LEAD = "Teach Speak Kit the names and terms you use. One list helps dictation, History search and the reader.";

function ResultDialog({ view, onClose }: { view: ImportView | null; onClose(): void }) {
  return (
    <Modal
      open={view !== null}
      onClose={onClose}
      title={view?.title ?? ""}
      width={480}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {view ? (
        <div className="vocab-result">
          {view.body.map((line) => (
            <p key={line} className="sk-modal-text" style={{ margin: 0 }}>
              {line}
            </p>
          ))}
          {view.skipped.length ? (
            <>
              <p className="vocab-result__label">Skipped</p>
              <ul className="vocab-result__list" aria-label="Skipped entries">
                {view.skipped.slice(0, 50).map((x, i) => (
                  <li key={`${i}-${x.line}`}>
                    <span>{x.line.length > 60 ? `${x.line.slice(0, 59)}…` : x.line}</span>
                    <em>{x.why}</em>
                  </li>
                ))}
              </ul>
              {view.skipped.length > 50 ? <p className="vocab-result__label">And {view.skipped.length - 50} more.</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** Export menu and the Import button; the import itself runs in the page, which the empty state shares. */
function Transfer({ s, onImport, onError }: { s: DictationStatus; onImport(): void; onError(message: string): void }) {
  const c = s.settings;
  const save = async (format: ExportFormat) => {
    try {
      await dictation.vocabExport(format, exportVocabulary({ terms: c.terms, replacements: c.replacements }, format));
    } catch {
      onError("The file could not be saved.");
    }
  };
  return (
    <div className="vocab-transfer">
      <Button iconLeft="upload" onClick={onImport}>
        Import
      </Button>
      <DropdownMenu
        trigger={
          <Button iconLeft="download" iconRight="chevron-down">
            Export
          </Button>
        }
      >
        <DropdownMenuItem onSelect={() => void save("json")}>Everything (.json)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void save("txt")}>Words only (.txt)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void save("csv")}>Replacements (.csv)</DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}

/** Vocabulary: the words dictation hears, and the pronunciations the reader uses. */
export function VocabularyPage({ voice, initialTab = "heard" }: { voice: string; initialTab?: VocabularyTab }) {
  const s = useDictation();
  const [tab, setTab] = useState<VocabularyTab>(() => takeVocabularyTab() ?? initialTab);
  const [result, setResult] = useState<ImportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!s)
    return (
      <Page title="Vocabulary" lead={LEAD}>
        {null}
      </Page>
    );
  const importFile = async () => {
    setError(null);
    try {
      const file = await dictation.vocabImport();
      if (!file) return;
      const c = s.settings;
      const res = importVocabulary({ terms: c.terms, replacements: c.replacements }, file.text, file.format);
      if (!res.error && (res.addedWords || res.addedReplacements)) await patchDictation({ terms: res.vocabulary.terms, replacements: res.vocabulary.replacements });
      setResult(importView(res, file.name));
    } catch {
      setError("The file could not be read. Nothing was added.");
    }
  };
  return (
    <Page title="Vocabulary" lead={LEAD} action={<Transfer s={s} onImport={() => void importFile()} onError={setError} />}>
      {error ? (
        <Banner tone="error" title="That did not work">
          {error}
        </Banner>
      ) : null}
      <Segmented
        label="Vocabulary"
        value={tab}
        onChange={(t) => setTab(t as VocabularyTab)}
        items={[
          { id: "heard", label: "Heard as" },
          { id: "read", label: "Read as" },
        ]}
      />
      {tab === "heard" ? <HeardAs s={s} onImport={() => void importFile()} onShowWords={() => window.scrollTo?.({ top: 0 })} /> : <ReadAs s={s} voice={voice} />}
      <ResultDialog view={result} onClose={() => setResult(null)} />
    </Page>
  );
}
