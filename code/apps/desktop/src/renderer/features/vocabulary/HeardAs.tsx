import { useState } from "react";
import { MAX_TERMS, removeTerm, soundsLikeRules, type Term } from "@speakkit/dictation";
import { Banner, Button, Chip, EmptyState, Icon, Select, SettingRow, TextInput, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { MAX_REPLACEMENTS, type Replacement } from "../../../shared/dictation/settings";
import { dictation } from "../dictation/api";
import { filterTerms, promptSummary, wordCount } from "./model";
import { RulesTester } from "./RulesTester";
import { useLive } from "./useLive";
import { WordDialog } from "./WordDialog";

const SHOWN = 6;

function WordRow({ term, first, last, canMove, onEdit, onDelete, onMove }: { term: Term; first: boolean; last: boolean; canMove: boolean; onEdit(): void; onDelete(): void; onMove(by: -1 | 1): void }) {
  return (
    <li className="lm-row vocab-row" data-term={term.id}>
      <span className="vocab-row__word">{term.word}</span>
      <span className="vocab-row__chips">
        {term.soundsLike.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </span>
      <span className="vocab-row__acts">
        {canMove ? (
          <>
            <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Move ${term.word} up`} disabled={first} onClick={() => onMove(-1)}>
              <Icon name="arrow-up" size={14} />
            </button>
            <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Move ${term.word} down`} disabled={last} onClick={() => onMove(1)}>
              <Icon name="arrow-down" size={14} />
            </button>
          </>
        ) : null}
        <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Edit ${term.word}`} onClick={onEdit}>
          <Icon name="pencil" size={14} />
        </button>
        <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Delete ${term.word}`} onClick={onDelete}>
          <Icon name="trash" size={14} />
        </button>
      </span>
    </li>
  );
}

/** Words and names, with how the model tends to hear them. The list is edited by row id. */
export function WordsCard({ terms, update, onImport }: { terms: Term[]; update(change: (t: Term[]) => Term[]): void; onImport(): void }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [dialog, setDialog] = useState<{ editing?: Term } | null>(null);
  const found = filterTerms(terms, query);
  const shown = all || query ? found : found.slice(0, SHOWN);
  const reorderable = !query.trim();
  const move = (id: string, by: -1 | 1) =>
    update((list) => {
      const i = list.findIndex((t) => t.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  return (
    <section className="lm-section" aria-labelledby="vocab-words">
      <header className="lm-section__head vocab-head">
        <h3 className="lm-section__title" id="vocab-words">
          Words and names
        </h3>
        <span className="vocab-count" data-testid="word-count">
          {wordCount(terms.length)}
        </span>
        <p className="lm-section__desc">When dictation gets a word wrong, add it here, with how it sounds if you know.</p>
      </header>
      {terms.length === 0 ? (
        <div className="lm-card">
          <EmptyState icon="book-2" title="No words yet">
            Add the names and terms you use, or import a list.
            <div className="vocab-empty-acts">
              <Button variant="primary" iconLeft="plus" onClick={() => setDialog({})}>
                Add word
              </Button>
              <Button iconLeft="upload" onClick={onImport}>
                Import a list
              </Button>
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className="lm-card vocab-card">
          <div className="vocab-bar">
            <TextInput icon="search" aria-label="Search your words" placeholder="Search your words" value={query} onChange={(e) => setQuery(e.target.value)} frameClassName="vocab-bar__search" />
            <Button variant="primary" iconLeft="plus" onClick={() => setDialog({})} disabled={terms.length >= MAX_TERMS}>
              Add word
            </Button>
          </div>
          {shown.length === 0 ? (
            <p className="vocab-empty-line">Nothing matches that search.</p>
          ) : (
            <ul className={`vocab-list${all || query ? " vocab-list--scroll" : ""}`} aria-label="Your words" tabIndex={all || query ? 0 : undefined}>
              {shown.map((t, i) => (
                <WordRow
                  key={t.id}
                  term={t}
                  first={i === 0}
                  last={i === shown.length - 1}
                  canMove={reorderable && all}
                  onEdit={() => setDialog({ editing: t })}
                  onDelete={() => update((list) => removeTerm(list, t.id))}
                  onMove={(by) => move(t.id, by)}
                />
              ))}
            </ul>
          )}
          <div className="vocab-foot">
            <span>{`Showing ${shown.length} of ${terms.length} words.`}</span>
            {!query && terms.length > SHOWN ? (
              <Button size="sm" onClick={() => setAll((a) => !a)}>
                {all ? "Show fewer" : "Show all"}
              </Button>
            ) : null}
          </div>
        </div>
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
  const sum = promptSummary(terms, s.settings.model, s.settings.prompt, model?.name ?? "This speech model");
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
          control={<Toggle aria-label="Send words to the speech model" checked={supported && s.settings.prompt} disabled={!supported} onChange={(prompt) => void dictation.patchSettings({ prompt })} />}
        />
        {sum.note ? (
          <Banner tone={supported ? "info" : "warning"} role="status">
            {sum.note}
          </Banner>
        ) : null}
        {supported ? (
          <p className="vocab-note">Words higher in the list go first. When the list is longer than the budget, the words at the bottom are only fixed after the model has heard you.</p>
        ) : null}
      </div>
    </section>
  );
}

const CASE = [
  { value: "ignore", label: "Ignore case" },
  { value: "match", label: "Match case" },
];

function RuleRow({ r, onChange, onDelete }: { r: Replacement; onChange(next: Replacement): void; onDelete(): void }) {
  return (
    <li className="lm-row vocab-rule">
      <span className="vocab-rule__from">{r.from}</span>
      <Icon name="arrow-right" size={14} className="vocab-arrow" />
      <span className="vocab-rule__to">{r.to || <em>Deletes the phrase</em>}</span>
      <Select label={`Capital letters for ${r.from}`} size="sm" value={r.matchCase ? "match" : "ignore"} options={CASE} onChange={(v) => onChange({ ...r, matchCase: v === "match" })} />
      <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Delete replacement ${r.from}`} onClick={onDelete}>
        <Icon name="trash" size={14} />
      </button>
    </li>
  );
}

/** Replacements: a phrase and what it becomes. An empty "Replace with" deletes the phrase. */
export function ReplacementsCard({ s, onShowWords }: { s: DictationStatus; onShowWords(): void }) {
  const [list, update] = useLive<Replacement>(s.settings.replacements, (next) => dictation.patchSettings({ replacements: next }));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const derived = soundsLikeRules(s.settings.terms).length;
  const add = () => {
    const key = from.trim();
    if (!key || list.length >= MAX_REPLACEMENTS) return;
    update((cur) => [...cur.filter((r) => r.from.toLowerCase() !== key.toLowerCase()), { from: key, to, ...(matchCase && { matchCase: true }) }]);
    setFrom("");
    setTo("");
  };
  return (
    <section className="lm-section" aria-labelledby="vocab-repl">
      <header className="lm-section__head vocab-head">
        <h3 className="lm-section__title" id="vocab-repl">
          Replacements
        </h3>
        <span className="vocab-count">
          {list.length} of {MAX_REPLACEMENTS} rules
        </span>
        <p className="lm-section__desc">Swap a phrase for other text after you speak it. Leave Replace with empty to delete the phrase. The longest phrase wins, and a replacement is never replaced again.</p>
      </header>
      <div className="lm-card">
        <div className="vocab-rule vocab-rule--head" aria-hidden="true">
          <span className="vocab-rule__from">When I say</span>
          <span className="vocab-arrow" />
          <span className="vocab-rule__to">Replace with</span>
          <span>Capitals</span>
        </div>
        <ul className="vocab-rules" aria-label="Replacement rules">
          {list.map((r) => (
            <RuleRow key={r.from} r={r} onChange={(next) => update((cur) => cur.map((x) => (x.from === r.from ? next : x)))} onDelete={() => update((cur) => cur.filter((x) => x.from !== r.from))} />
          ))}
        </ul>
        <form
          className="lm-row vocab-rule vocab-rule--add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <TextInput aria-label="When I say" placeholder="When I say" value={from} onChange={(e) => setFrom(e.target.value)} maxLength={80} frameClassName="vocab-rule__field" />
          <Icon name="arrow-right" size={14} className="vocab-arrow" />
          <TextInput aria-label="Replace with" placeholder="Replace with" value={to} onChange={(e) => setTo(e.target.value)} maxLength={200} frameClassName="vocab-rule__field vocab-rule__field--wide" />
          <Select label="Capital letters" size="sm" value={matchCase ? "match" : "ignore"} options={CASE} onChange={(v) => setMatchCase(v === "match")} />
          <Button type="submit" variant="primary" disabled={!from.trim() || list.length >= MAX_REPLACEMENTS}>
            Add
          </Button>
        </form>
        {derived ? (
          <p className="vocab-note">
            {derived} more {derived === 1 ? "rule comes" : "rules come"} from the sounds-like spellings of your words.{" "}
            <button type="button" className="vocab-link" onClick={onShowWords}>
              See your words
            </button>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** The Heard as tab: words, the model prompt, replacements and the tester. */
export function HeardAs({ s, onImport, onShowWords }: { s: DictationStatus; onImport(): void; onShowWords(): void }) {
  const [terms, update] = useLive<Term>(s.settings.terms, (next) => dictation.patchSettings({ terms: next }));
  return (
    <>
      <WordsCard terms={terms} update={update} onImport={onImport} />
      <PromptCard s={s} terms={terms} />
      <ReplacementsCard s={s} onShowWords={onShowWords} />
      <RulesTester s={s} />
    </>
  );
}
