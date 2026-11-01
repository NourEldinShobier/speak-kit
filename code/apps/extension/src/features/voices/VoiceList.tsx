import { useMemo, useState } from "react";
import type { Voice } from "@speakkit/protocol";
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

export interface VoiceListProps {
  state: VoicesState;
  selected: string;
  onSelect(id: string): void;
  onPreview(id: string): void;
}

/** Searchable, filterable voice picker (popup A6 and the in-page voice popover share this look). Rows are options of a listbox. */
export function VoiceList({ state, selected, onSelect, onPreview }: VoiceListProps) {
  const [q, setQ] = useState("");
  const [accent, setAccent] = useState<AccentFilter>("any");
  const [gender, setGender] = useState<GenderFilter>("any");
  const list = useMemo(() => filterVoices(state.voices, q, accent, gender), [state.voices, q, accent, gender]);
  const total = state.voices.length;
  return (
    <section className="sk-voices" aria-label="Voices">
      <TextInput
        type="search"
        size="sm"
        icon="search"
        aria-label={total ? `Search ${total} voices` : "Search voices"}
        placeholder={total ? `Search ${total} voices` : "Search voices"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="sk-voices__filters">
        <Select size="sm" label="Language" options={LANGS} value="en" />
        <Select size="sm" label="Accent" options={ACCENTS} value={accent} onChange={(v) => setAccent(v as AccentFilter)} />
        <Select size="sm" label="Gender" options={GENDERS} value={gender} onChange={(v) => setGender(v as GenderFilter)} />
      </div>
      <ul className="sk-voices__list" role="listbox" aria-label="Voices" aria-busy={state.status === "loading"}>
        {list.map((v: Voice) => {
          const sel = v.id === selected;
          return (
            <li
              key={v.id}
              role="option"
              aria-selected={sel}
              data-voice={v.id}
              tabIndex={0}
              className={sel ? "sk-voice is-selected" : "sk-voice"}
              onClick={() => onSelect(v.id)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(v.id);
                }
              }}
            >
              <Avatar name={v.name} size={28} tone={sel ? "accent" : "purple"} aria-hidden />
              <span className="sk-voice__text">
                <b>{v.name}</b>
                <span>
                  {langLabel(v.lang)} · Quality {qualityLabel(v)}
                </span>
              </span>
              {sel ? <Icon name="check" size={16} className="sk-voice__check" /> : null}
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
        })}
        {state.status === "loading" ? <li className="sk-voices__none" role="presentation">Loading voices from the app...</li> : null}
        {state.status === "error" ? <li className="sk-voices__none" role="presentation">Voices appear when SpeakKit is running.</li> : null}
        {state.status === "ready" && list.length === 0 ? <li className="sk-voices__none" role="presentation">No voices match.</li> : null}
      </ul>
    </section>
  );
}
