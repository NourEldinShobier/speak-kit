import { useState } from "react";
import { removeCorrection, type Correction } from "@speakkit/dictation";
import { Button, Icon, TextInput } from "@speakkit/ui";
import { addByHand, checkByHand, countText, HAND_TEXT, scopeText, seenText, statusText, acceptSuggestion } from "./model";
import "./corrections.css";

/** Edits the list: gets a function from the current list to the next, as the page keeps it live. */
type UpdateCorrections = (change: (cur: Correction[]) => Correction[]) => void;

const iconBtn = "lm-btn lm-btn--icon lm-btn--secondary";

function Row({ c, update }: { c: Correction; update: UpdateCorrections }) {
  const suggested = statusText(c) === "Suggested";
  return (
    <li className="lm-row corr-row" data-correction={c.id}>
      <span className="corr-row__from">{c.heard}</span>
      <Icon name="arrow-right" size={14} className="vocab-arrow" />
      <span className="corr-row__to">{c.correct}</span>
      <span className="corr-row__meta">
        {scopeText(c)}, {seenText(c).toLowerCase()}
      </span>
      {suggested ? (
        <Button size="sm" aria-label={`Use the suggestion ${c.heard}`} onClick={() => update((cur) => acceptSuggestion(cur, c.id))}>
          Use
        </Button>
      ) : (
        <span className="corr-row__status">Active</span>
      )}
      <button type="button" className={iconBtn} aria-label={`Delete correction ${c.heard}`} onClick={() => update((cur) => removeCorrection(cur, c.id))}>
        <Icon name="trash" size={14} />
      </button>
    </li>
  );
}

function AddCorrection({ list, update }: { list: readonly Correction[]; update: UpdateCorrections }) {
  const [heard, setHeard] = useState("");
  const [correct, setCorrect] = useState("");
  const [app, setApp] = useState("");
  const problem = checkByHand(list, heard, correct, app);
  const submit = () => {
    if (problem) return;
    update((cur) => addByHand(cur, { heard, correct, app }, Date.now()));
    [setHeard, setCorrect, setApp].forEach((set) => set(""));
  };
  return (
    <form
      className="lm-row corr-row corr-row--add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextInput aria-label="Heard" placeholder="Heard" value={heard} onChange={(e) => setHeard(e.target.value)} maxLength={80} frameClassName="vocab-rule__field" />
      <Icon name="arrow-right" size={14} className="vocab-arrow" />
      <TextInput aria-label="Should be" placeholder="Should be" value={correct} onChange={(e) => setCorrect(e.target.value)} maxLength={80} frameClassName="vocab-rule__field" />
      <TextInput
        aria-label="Only in this program, by file name (optional)"
        placeholder="Only in program, e.g. code.exe"
        value={app}
        onChange={(e) => setApp(e.target.value)}
        maxLength={80}
        frameClassName="vocab-rule__field"
      />
      <Button type="submit" variant="primary" disabled={problem !== undefined}>
        Add correction
      </Button>
      {problem && problem !== "empty" ? (
        <p className="corr-row__problem" role="status">
          {HAND_TEXT[problem]}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Corrections: words the speech model got wrong and what they should be, learned from the History screen or the Learn correction key, or added by hand.
 * A suggestion waits for one click; a fix applies after every dictation, ahead of the rewrite.
 */
export function CorrectionsCard({ list, update }: { list: readonly Correction[]; update: UpdateCorrections }) {
  return (
    <section className="lm-section" aria-labelledby="vocab-corr">
      <header className="lm-section__head vocab-head">
        <h3 className="lm-section__title" id="vocab-corr">
          Corrections
        </h3>
        <span className="vocab-count">{countText(list.length)}</span>
        <p className="lm-section__desc">
          Fixes for words the speech model keeps getting wrong, such as &ldquo;cloud code&rdquo; for &ldquo;Claude Code&rdquo;. Only the exact words you heard are swapped, in any capitals. Fix a
          dictation in History, or press the Learn correction shortcut after you fix text in another app.
        </p>
      </header>
      <div className="lm-card">
        <ul className="corr-rows" aria-label="Corrections">
          {list.map((c) => (
            <Row key={c.id} c={c} update={update} />
          ))}
        </ul>
        {list.length === 0 ? <p className="vocab-note">No corrections yet.</p> : null}
        <AddCorrection list={list} update={update} />
      </div>
    </section>
  );
}
