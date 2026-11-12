import { useId, useMemo, useState } from "react";
import { addTerm, type Term } from "@speakkit/dictation";
import { Button, Icon, TextInput } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { dictation } from "../dictation/api";
import { changedWords, parseSounds, testStages } from "./model";

/** Type a sentence the way the speech model might write it and see each step. Nothing is saved, except through "Fix this". */
export function RulesTester({
  s,
  title = "Try your rules",
  lead = "Type a sentence as the model might hear it and see each step. Nothing is saved.",
  initial = "",
  language: forced,
}: {
  s: DictationStatus;
  title?: string;
  lead?: string;
  initial?: string;
  /** The language whose rules are tried; the dictation language when missing. */
  language?: string;
}) {
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState(false);
  const c = s.settings;
  const language = forced ?? (c.language === "auto" ? "en" : c.language);
  const result = useMemo(() => (text.trim() ? testStages(text, { terms: c.terms, replacements: c.replacements, cleanup: c.cleanup, language }) : null), [text, c.terms, c.replacements, c.cleanup, language]);
  const heard = result?.stages[0]?.text ?? "";
  const final = result?.final ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(final);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="lm-section vocab-tester" aria-label={title}>
      <header className="lm-section__head">
        <h3 className="lm-section__title">{title}</h3>
        <p className="lm-section__desc">{lead}</p>
      </header>
      <div className="lm-card vocab-tester__card">
        <div className="vocab-tester__in">
          <TextInput aria-label="Sentence to test" placeholder="tell the team the cooper netties update is live" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoComplete="off" spellCheck={false} />
        </div>
        {result ? (
          <>
            <ol className="vocab-steps" aria-label="Steps">
              {result.stages.map((st, i) => (
                <li key={st.key} className="vocab-step" data-step={st.key}>
                  <div className="vocab-step__head">
                    <b>
                      {i + 1} · {st.title}
                    </b>
                    <span>{st.note}</span>
                  </div>
                  <div className="vocab-step__text">{st.text || "Nothing is inserted"}</div>
                </li>
              ))}
            </ol>
            <FinalRow final={final} heard={heard} terms={c.terms} copied={copied} onCopy={() => void copy()} />
          </>
        ) : (
          <p className="vocab-empty-line">Type a sentence above to see what each step does.</p>
        )}
      </div>
    </section>
  );
}

function FinalRow({ final, heard, terms, copied, onCopy }: { final: string; heard: string; terms: readonly Term[]; copied: boolean; onCopy(): void }) {
  const [fixing, setFixing] = useState(false);
  return (
    <>
      <div className="vocab-final">
        <div className="vocab-final__text">
          <span className="vocab-final__label">Final text</span>
          <span data-testid="tester-final">{final || "Nothing is inserted"}</span>
        </div>
        <div className="vocab-final__acts">
          <Button iconLeft="pencil" disabled={!final} onClick={() => setFixing((f) => !f)} aria-expanded={fixing}>
            Fix this
          </Button>
          <Button iconLeft={copied ? "check" : "copy"} disabled={!final} onClick={onCopy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      {fixing ? <FixForm heard={heard} final={final} terms={terms} onDone={() => setFixing(false)} /> : null}
    </>
  );
}

/** Manual only: one button adds the right spelling, with what was heard as its sounds-like spelling. */
function FixForm({ heard, final, terms, onDone }: { heard: string; final: string; terms: readonly Term[]; onDone(): void }) {
  const guess = changedWords(heard, final);
  const id = useId();
  const [word, setWord] = useState(guess?.word ?? "");
  const [sounds, setSounds] = useState(guess?.heard ?? "");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const r = addTerm(terms, { word, soundsLike: parseSounds(sounds) });
    if (!r.ok) {
      setError(r.error === "duplicate" ? `"${r.existing?.word ?? word}" is already in your words. Edit it on the Vocabulary page.` : r.error === "too-long" ? "That word is too long." : r.error === "full" ? "The list is full." : "Type the right spelling.");
      return;
    }
    void dictation.patchSettings({ terms: r.list });
    onDone();
  };
  return (
    <form
      className="vocab-fix"
      aria-label="Fix this"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <p id={`${id}-t`} className="vocab-fix__lead">
        Add the right spelling to Vocabulary, with how it was heard. Only when you choose.
      </p>
      <TextInput label="Right spelling" value={word} onChange={(e) => setWord(e.target.value)} error={error ?? undefined} autoComplete="off" spellCheck={false} />
      <TextInput label="Heard as" value={sounds} onChange={(e) => setSounds(e.target.value)} autoComplete="off" spellCheck={false} />
      <div className="vocab-fix__foot">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={!word.trim()}>
          <Icon name="plus" size={14} /> Add to Vocabulary
        </Button>
      </div>
    </form>
  );
}
