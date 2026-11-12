import { useState } from "react";
import { Button, Icon, Select, TextInput } from "@speakkit/ui";
import { MAX_REPLACEMENTS, type Replacement } from "../../../shared/dictation/settings";

const iconBtn = "lm-btn lm-btn--icon lm-btn--secondary";

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
      <button type="button" className={iconBtn} aria-label={`Delete replacement ${r.from}`} onClick={onDelete}>
        <Icon name="trash" size={14} />
      </button>
    </li>
  );
}

function AddRule({ full, onAdd }: { full: boolean; onAdd(r: Replacement): void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const submit = () => {
    if (!from.trim() || full) return;
    onAdd({ from: from.trim(), to, ...(matchCase && { matchCase: true }) });
    setFrom("");
    setTo("");
  };
  return (
    <form
      className="lm-row vocab-rule vocab-rule--add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextInput aria-label="When I say" placeholder="When I say" value={from} onChange={(e) => setFrom(e.target.value)} maxLength={80} frameClassName="vocab-rule__field" />
      <Icon name="arrow-right" size={14} className="vocab-arrow" />
      <TextInput aria-label="Replace with" placeholder="Replace with" value={to} onChange={(e) => setTo(e.target.value)} maxLength={200} frameClassName="vocab-rule__field vocab-rule__field--wide" />
      <Select label="Capital letters" size="sm" value={matchCase ? "match" : "ignore"} options={CASE} onChange={(v) => setMatchCase(v === "match")} />
      <Button type="submit" variant="primary" disabled={!from.trim() || full}>
        Add
      </Button>
    </form>
  );
}

/** The rows of replacements and the form that adds one; `update` gets a function from the current list to the next, as `useLive` provides. */
export function ReplacementRules({ rules, update, label }: { rules: readonly Replacement[]; update(change: (cur: Replacement[]) => Replacement[]): void; label: string }) {
  return (
    <>
      <div className="vocab-rule vocab-rule--head" aria-hidden="true">
        <span className="vocab-rule__from">When I say</span>
        <span className="vocab-arrow" />
        <span className="vocab-rule__to">Replace with</span>
        <span>Capitals</span>
      </div>
      <ul className="vocab-rules" aria-label={label}>
        {rules.map((r) => (
          <RuleRow key={r.from} r={r} onChange={(next) => update((cur) => cur.map((x) => (x.from === r.from ? next : x)))} onDelete={() => update((cur) => cur.filter((x) => x.from !== r.from))} />
        ))}
      </ul>
      <AddRule full={rules.length >= MAX_REPLACEMENTS} onAdd={(r) => update((cur) => [...cur.filter((x) => x.from.toLowerCase() !== r.from.toLowerCase()), r])} />
    </>
  );
}
