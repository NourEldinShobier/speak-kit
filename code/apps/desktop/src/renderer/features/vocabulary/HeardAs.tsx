import { useState } from "react";
import { acceptSuggestions, MAX_TERMS, removeTerm, type Term } from "@speakkit/dictation";
import { Banner, Button, Chip, EmptyState, Icon, SettingRow, TextInput, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { patchDictation } from "../dictation-bridge";
import { filterTerms, promptSummary, savedTerms, seenText, suggestedTerms, termNotes, wordCount } from "./model";
import { useLive } from "./useLive";
import { WordDialog } from "./WordDialog";

const SHOWN = 6;

interface RowProps {
  term: Term;
  onEdit(): void;
  onDelete(): void;
}

const iconBtn = "lm-btn lm-btn--icon lm-btn--secondary";

function WordRow({ term, onEdit, onDelete }: RowProps) {
  const notes = termNotes(term);
  return (
    <li className="lm-row vocab-row" data-term={term.id}>
      <span className="vocab-row__word">
        {term.word}
        {notes.length ? <span className="vocab-row__notes">{notes.join(". ")}</span> : null}
      </span>
      <span className="vocab-row__chips">
        {term.soundsLike.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </span>
      <span className="vocab-row__acts">
        <button type="button" className={iconBtn} aria-label={`Edit ${term.word}`} onClick={onEdit}>
          <Icon name="pencil" size={14} />
        </button>
        <button type="button" className={iconBtn} aria-label={`Delete ${term.word}`} onClick={onDelete}>
          <Icon name="trash" size={14} />
        </button>
      </span>
    </li>
  );
}

interface ListProps {
  shown: Term[];
  scroll: boolean;
  update(change: (t: Term[]) => Term[]): void;
  onEdit(t: Term): void;
}

function WordList({ shown, scroll, update, onEdit }: ListProps) {
  if (shown.length === 0) return <p className="vocab-empty-line">Nothing matches that search.</p>;
  return (
    <ul className={`vocab-list${scroll ? " vocab-list--scroll" : ""}`} aria-label="Your words" tabIndex={scroll ? 0 : undefined}>
      {shown.map((t) => (
        <WordRow key={t.id} term={t} onEdit={() => onEdit(t)} onDelete={() => update((list) => removeTerm(list, t.id))} />
      ))}
    </ul>
  );
}

function EmptyWords({ onAdd, onImport }: { onAdd(): void; onImport(): void }) {
  return (
    <div className="lm-card">
      <EmptyState icon="book-2" title="No words yet">
        Add the names and terms you use, or import a list.
        <div className="vocab-empty-acts">
          <Button variant="primary" iconLeft="plus" onClick={onAdd}>
            Add word
          </Button>
          <Button iconLeft="upload" onClick={onImport}>
            Import a list
          </Button>
        </div>
      </EmptyState>
    </div>
  );
}

interface CardProps {
  terms: Term[];
  update(change: (t: Term[]) => Term[]): void;
  onAdd(): void;
  onEdit(t: Term): void;
  query: string;
  setQuery(q: string): void;
}

function WordsBody({ terms, update, onAdd, onEdit, query, setQuery }: CardProps) {
  const [all, setAll] = useState(false);
  const found = filterTerms(terms, query);
  const expanded = all || !!query;
  const shown = expanded ? found : found.slice(0, SHOWN);
  return (
    <div className="lm-card vocab-card">
      <div className="vocab-bar">
        <TextInput icon="search" aria-label="Search your words" placeholder="Search your words" value={query} onChange={(e) => setQuery(e.target.value)} frameClassName="vocab-bar__search" />
        <Button variant="primary" iconLeft="plus" onClick={onAdd} disabled={terms.length >= MAX_TERMS}>
          Add word
        </Button>
      </div>
      <WordList shown={shown} scroll={expanded} update={update} onEdit={onEdit} />
      <div className="vocab-foot">
        <span>{`Showing ${shown.length} of ${terms.length} words.`}</span>
        {!query && terms.length > SHOWN ? (
          <Button size="sm" onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer" : "Show all"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** A fix the person made that waits for one click. A fix seen a second time already applies, and the row says so. */
function SuggestionRow({ term, update }: { term: Term; update(change: (t: Term[]) => Term[]): void }) {
  const heard = term.learned?.heard ?? term.soundsLike[0] ?? "";
  const applying = (term.learned?.count ?? 0) >= 2;
  return (
    <li className="lm-row vocab-suggest" data-term={term.id}>
      <span className="vocab-suggest__from">{heard}</span>
      <Icon name="arrow-right" size={14} className="vocab-arrow" />
      <span className="vocab-suggest__to">{term.word}</span>
      <span className="vocab-suggest__meta">{[term.app && `only in ${term.app}.exe`, seenText(term).toLowerCase(), applying && "already applied"].filter(Boolean).join(", ")}</span>
      <Button size="sm" aria-label={`Use the suggestion ${heard}`} onClick={() => update((list) => acceptSuggestions(list, [term.id]))}>
        Use
      </Button>
      <Button size="sm" aria-label={`Dismiss the suggestion ${heard}`} onClick={() => update((list) => removeTerm(list, term.id))}>
        Dismiss
      </Button>
    </li>
  );
}

/**
 * Suggested: fixes learned from History or the Learn correction shortcut. Use makes one a normal entry; a fix seen a second time applies by itself until it is dismissed.
 * Nothing is shown when there are none.
 */
export function SuggestedCard({ terms, update }: { terms: readonly Term[]; update(change: (t: Term[]) => Term[]): void }) {
  const found = suggestedTerms(terms);
  if (!found.length) return null;
  return (
    <section className="lm-section" aria-labelledby="vocab-suggested">
      <header className="lm-section__head">
        <h3 className="lm-section__title" id="vocab-suggested">
          Suggested
        </h3>
        <p className="lm-section__desc">Fixes you made to dictated text. Use one to keep it as a word, or dismiss it.</p>
      </header>
      <div className="lm-card">
        <ul className="vocab-suggests" aria-label="Suggested fixes">
          {found.map((t) => (
            <SuggestionRow key={t.id} term={t} update={update} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Words and names, with how the model tends to hear them. The list is edited by row id. */
export function WordsCard({ terms, update, onImport }: { terms: Term[]; update(change: (t: Term[]) => Term[]): void; onImport(): void }) {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ editing?: Term } | null>(null);
  const saved = savedTerms(terms);
  return (
    <section className="lm-section" aria-labelledby="vocab-words">
      <header className="lm-section__head vocab-head">
        <h3 className="lm-section__title" id="vocab-words">
          Words and names
        </h3>
        <span className="vocab-count" data-testid="word-count">
          {wordCount(saved.length)}
        </span>
        <p className="lm-section__desc">
          When dictation gets a word wrong, add it here, with how it is heard if you know. Heard as spellings are swapped for the word after you speak. Fix a dictation in History, or press the Learn
          correction shortcut after you fix text in another app, to add one from there.
        </p>
      </header>
      {saved.length === 0 ? (
        <EmptyWords onAdd={() => setDialog({})} onImport={onImport} />
      ) : (
        <WordsBody terms={saved} update={update} onAdd={() => setDialog({})} onEdit={(t) => setDialog({ editing: t })} query={query} setQuery={setQuery} />
      )}
      <WordDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        terms={terms}
        editing={dialog?.editing}
        onSave={(next) => update(() => next)}
        onShow={(t) => {
          setQuery(t.word);
          setDialog(null);
        }}
      />
    </section>
  );
}

/** The switch that sends the words to the speech model, and what it reads. */
export function PromptCard({ s, terms }: { s: DictationStatus; terms: readonly Term[] }) {
  const model = s.models.find((m) => m.selected);
  const sum = promptSummary(terms, { model: s.settings.model, on: s.settings.prompt, modelName: model?.name ?? "This speech model" });
  const supported = sum.state !== "unsupported";
  return (
    <section className="lm-section" aria-label="Speech model prompt">
      <header className="lm-section__head">
        <h3 className="lm-section__title">Speech model prompt</h3>
        <p className="lm-section__desc">Gives the speech model your words before it listens, so it spells them right the first time.</p>
      </header>
      <div className="lm-card">
        <SettingRow
          label="Send words to the speech model"
          description={sum.line}
          control={<Toggle aria-label="Send words to the speech model" checked={supported && s.settings.prompt} disabled={!supported} onChange={(prompt) => void patchDictation({ prompt })} />}
        />
        {sum.note ? (
          <Banner tone={supported ? "info" : "warning"} role="status">
            {sum.note}
          </Banner>
        ) : null}
        {supported ? <p className="vocab-note">Words you added first go first. When the list is longer than the budget, the words added last are only fixed after the model has heard you.</p> : null}
      </div>
    </section>
  );
}

/** The Heard as tab: suggested fixes, the one list of words and the model prompt. */
export function HeardAs({ s, onImport }: { s: DictationStatus; onImport(): void }) {
  const [terms, update] = useLive<Term>(s.settings.terms, (next) => patchDictation({ terms: next }));
  return (
    <>
      <SuggestedCard terms={terms} update={update} />
      <WordsCard terms={terms} update={update} onImport={onImport} />
      <PromptCard s={s} terms={terms} />
    </>
  );
}
