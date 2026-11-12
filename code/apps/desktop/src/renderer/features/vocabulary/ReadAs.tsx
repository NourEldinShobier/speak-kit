import { useState } from "react";
import { addPronunciation, applyReadAs, MAX_PRONUNCIATIONS, MAX_SPOKEN, MAX_WRITTEN, type Pronunciation } from "@speakkit/dictation";
import { Banner, Button, EmptyState, Icon, Modal, TextInput } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { dictation } from "../dictation/api";
import { usePlayer } from "../../pages";
import { pronunciationCount } from "./model";
import { useLive } from "./useLive";

const voiceName = (id: string): string => {
  const n = id.replace(/^[a-z]{2}_/, "");
  return n ? n[0]!.toUpperCase() + n.slice(1) : id;
};

const ERRORS = {
  empty: "Type both the written form and how it is said.",
  "too-long": `The written form can be up to ${MAX_WRITTEN} characters and the spoken form up to ${MAX_SPOKEN}.`,
  duplicate: "That written form is already in the list.",
  full: `The list is full: ${MAX_PRONUNCIATIONS} entries.`,
  same: "The spoken form is the same as the written one. Spell it the way it should sound.",
} as const;

function AddDialog({ open, list, onClose, onSave }: { open: boolean; list: readonly Pronunciation[]; onClose(): void; onSave(next: Pronunciation[]): void }) {
  const [written, setWritten] = useState("");
  const [spoken, setSpoken] = useState("");
  const [error, setError] = useState<string | undefined>();
  const submit = () => {
    const r = addPronunciation(list, { written, spoken });
    if (!r.ok) return setError(ERRORS[r.error]);
    onSave(r.list);
    setWritten("");
    setSpoken("");
    setError(undefined);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={() => {
        setError(undefined);
        onClose();
      }}
      title="Add a pronunciation"
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!written.trim() || !spoken.trim()} onClick={submit}>
            Add pronunciation
          </Button>
        </>
      }
    >
      <form
        className="vocab-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextInput label="Written as" placeholder="GIF" value={written} onChange={(e) => setWritten(e.target.value)} data-autofocus="" autoComplete="off" spellCheck={false} />
        <TextInput label="Read as" hint="Spell it the way it should sound." placeholder="jiff" value={spoken} onChange={(e) => setSpoken(e.target.value)} error={error} autoComplete="off" spellCheck={false} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** The Read as tab: how the reader and voice chat say a written form. The text on screen does not change. */
export function ReadAs({ s, voice }: { s: DictationStatus; voice: string }) {
  const [list, update] = useLive<Pronunciation>(s.settings.readAs, (next) => dictation.patchSettings({ readAs: next }));
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [test, setTest] = useState("The GIF was deployed with kubectl.");
  const { playing, error, toggle } = usePlayer();
  const q = query.trim().toLowerCase();
  const shown = q ? list.filter((p) => p.written.toLowerCase().includes(q) || p.spoken.toLowerCase().includes(q)) : list;
  const spoken = applyReadAs(test, list);
  return (
    <>
      <section className="lm-section" aria-labelledby="vocab-read">
        <header className="lm-section__head vocab-head">
          <h3 className="lm-section__title" id="vocab-read">
            Pronunciations
          </h3>
          <span className="vocab-count" data-testid="pron-count">
            {pronunciationCount(list.length, MAX_PRONUNCIATIONS)}
          </span>
          <p className="lm-section__desc">Used by the reader and by voice chat. Spell a word the way it should sound. The text on screen does not change.</p>
        </header>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {list.length === 0 ? (
          <div className="lm-card">
            <EmptyState icon="volume" title="No pronunciations yet">
              Add a word the reader says wrong, and how it should sound.
              <div className="vocab-empty-acts">
                <Button variant="primary" iconLeft="plus" onClick={() => setAdding(true)}>
                  Add pronunciation
                </Button>
              </div>
            </EmptyState>
          </div>
        ) : (
          <div className="lm-card vocab-card">
            <div className="vocab-bar">
              <TextInput icon="search" aria-label="Search pronunciations" placeholder="Search pronunciations" value={query} onChange={(e) => setQuery(e.target.value)} frameClassName="vocab-bar__search" />
              <Button variant="primary" iconLeft="plus" onClick={() => setAdding(true)} disabled={list.length >= MAX_PRONUNCIATIONS}>
                Add pronunciation
              </Button>
            </div>
            <div className="vocab-pron vocab-pron--head" aria-hidden="true">
              <span>Written as</span>
              <span />
              <span>Read as</span>
              <span>Sample voice: {voiceName(voice)}</span>
            </div>
            {shown.length === 0 ? (
              <p className="vocab-empty-line">Nothing matches that search.</p>
            ) : (
              <ul className="vocab-list vocab-list--scroll" aria-label="Pronunciations" tabIndex={0}>
                {shown.map((p) => (
                  <li key={p.id} className="lm-row vocab-pron" data-pron={p.id}>
                    <span className="vocab-pron__written">{p.written}</span>
                    <Icon name="arrow-right" size={14} className="vocab-arrow" />
                    <span className="vocab-pron__read">{p.spoken}</span>
                    <span className="vocab-row__acts is-visible">
                      <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Play sample of ${p.written}`} aria-pressed={playing === p.id} onClick={() => void toggle(voice, p.spoken, p.id)}>
                        <Icon name={playing === p.id ? "player-pause" : "player-play"} size={14} />
                      </button>
                      <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Delete ${p.written}`} onClick={() => update((cur) => cur.filter((x) => x.id !== p.id))}>
                        <Icon name="trash" size={14} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      <section className="lm-section" aria-label="Try the reader">
        <header className="lm-section__head">
          <h3 className="lm-section__title">Try the reader</h3>
          <p className="lm-section__desc">Type a sentence to see how it is said, and play it.</p>
        </header>
        <div className="lm-card vocab-tester__card">
          <div className="vocab-tester__in">
            <TextInput aria-label="Sentence to read" value={test} onChange={(e) => setTest(e.target.value)} maxLength={300} autoComplete="off" spellCheck={false} />
          </div>
          <div className="vocab-final">
            <div className="vocab-final__text">
              <span className="vocab-final__label">Spoken wording</span>
              <span data-testid="spoken-wording">{spoken || "Nothing to read"}</span>
            </div>
            <Button iconLeft={playing === "test" ? "player-pause" : "player-play"} disabled={!spoken.trim()} onClick={() => void toggle(voice, spoken, "test")}>
              {playing === "test" ? "Stop" : "Play"}
            </Button>
          </div>
        </div>
      </section>
      <AddDialog open={adding} list={list} onClose={() => setAdding(false)} onSave={(next) => update(() => next)} />
    </>
  );
}
