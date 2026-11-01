import { useMemo, useState } from "react";
import { plural, type Voice } from "@speakkit/protocol";
import { Avatar, Icon, IconButton, Select, TextInput } from "@speakkit/ui";
import { filterVoices, langLabel, qualityLabel, type AccentFilter, type GenderFilter } from "./catalog";
import type { VoicesState } from "./hooks";

const ACCENTS = [
  { value: "any", label: "Accent: Any" },
  { value: "en-US", label: "Accent: US English" },
  { value: "en-GB", label: "Accent: UK English" },
];
const GENDERS = [
  { value: "any", label: "Voice: Any" },
  { value: "female", label: "Voice: Female" },
  { value: "male", label: "Voice: Male" },
];
const LANGS = [{ value: "en", label: "Language: English" }];

interface VoiceListProps {
  state: VoicesState;
  selected: string;
  onSelect(id: string): void;
  onPreview(id: string): void;
}

function VoiceRow({ v, selected, onSelect, onPreview }: { v: Voice; selected: boolean; onSelect(id: string): void; onPreview(id: string): void }) {
  return (
    <li data-voice={v.id} className={selected ? "sk-voice is-selected" : "sk-voice"}>
      <button type="button" aria-current={selected ? "true" : undefined} className="sk-voice__opt" onClick={() => onSelect(v.id)}>
        <Avatar name={v.name} size={28} tone={selected ? "accent" : "purple"} aria-hidden />
        <span className="sk-voice__text">
          <b>{v.name}</b>
          <span>
            {langLabel(v.lang)} · Quality {qualityLabel(v)}
          </span>
        </span>
        {selected ? <Icon name="check" size={16} className="sk-voice__check" /> : null}
      </button>
      <IconButton
        name="player-play"
        label={`Preview ${v.name}`}
        size={28}
        onClick={(e) => {
          e.stopPropagation();
          onPreview(v.id);
        }}
      />
    </li>
  );
}

/** The single line shown instead of rows: loading, offline, or no match; null when there are rows to show. */
function noRowsText(status: VoicesState["status"], shown: number): string | null {
  if (status === "loading") return "Loading voices from the app...";
  if (status === "error") return "Voices appear when Speak Kit is running.";
  return status === "ready" && shown === 0 ? "No voices match." : null;
}

/** Searchable, filterable voice picker (popup A6 and the in-page voice popover share this look). Each row is a button that picks the voice plus a preview button. */
export function VoiceList({ state, selected, onSelect, onPreview }: VoiceListProps) {
  const [q, setQ] = useState("");
  const [accent, setAccent] = useState<AccentFilter>("any");
  const [gender, setGender] = useState<GenderFilter>("any");
  const list = useMemo(() => filterVoices(state.voices, { q, accent, gender }), [state.voices, q, accent, gender]);
  const total = state.voices.length;
  const label = total ? `Search ${plural(total, "voice", "voices")}` : "Search voices";
  const none = noRowsText(state.status, list.length);
  return (
    <section className="sk-voices" aria-label="Voices">
      <TextInput type="search" size="sm" icon="search" aria-label={label} placeholder={label} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="sk-voices__filters">
        <Select size="sm" label="Language" options={LANGS} value="en" />
        <Select size="sm" label="Accent" options={ACCENTS} value={accent} onChange={(v) => setAccent(v as AccentFilter)} />
        <Select size="sm" label="Gender" options={GENDERS} value={gender} onChange={(v) => setGender(v as GenderFilter)} />
      </div>
      <ul className="sk-voices__list" aria-label="Voices" aria-busy={state.status === "loading"}>
        {list.map((v) => (
          <VoiceRow key={v.id} v={v} selected={v.id === selected} onSelect={onSelect} onPreview={onPreview} />
        ))}
        {none ? (
          <li className="sk-voices__none" role="presentation">
            {none}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
