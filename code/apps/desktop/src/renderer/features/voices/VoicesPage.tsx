import { useEffect, useMemo, useReducer } from "react";
import { Avatar, Badge, Banner, Button, EmptyState, Segmented, StatusPill, TextInput, type Tone } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { usePlayer } from "../../pages";
import { api, Page } from "../../ui";
import { filterVoices, initVoices, VOICE_FILTERS, voicesReducer, type VoiceFilter } from "./model";

const GRADE_TONE: Record<Voice["quality"], Tone> = { A: "green", B: "blue", C: "orange", D: "red" };
const AVATAR_TONES: Tone[] = ["blue", "orange", "green", "purple", "red", "yellow"];

interface CardProps {
  voice: Voice;
  tone: Tone;
  isDefault: boolean;
  playing: boolean;
  onPreview(): void;
}

function VoiceCard({ voice: v, tone, isDefault, playing: on, onPreview }: CardProps) {
  return (
    <div className="sk-voice" data-voice={v.id}>
      <div className="sk-voice__h">
        <Avatar name={v.name} tone={tone} />
        <div style={{ flex: 1 }}>
          <b>
            {v.name}
            {isDefault && <Badge>Default</Badge>}
          </b>
          <small>
            {v.lang === "en-US" ? "US English" : "UK English"} · {v.gender === "female" ? "Female" : "Male"}
          </small>
        </div>
      </div>
      <div className="sk-voice__t">{v.traits}</div>
      <div className="sk-voice__f">
        <Button size="sm" variant={on ? "primary" : "secondary"} iconLeft={on ? "player-stop" : "player-play"} aria-label={`${on ? "Stop" : "Preview"} ${v.name}`} onClick={onPreview}>
          {on ? "Stop" : "Preview"}
        </Button>
        <StatusPill tone={GRADE_TONE[v.quality]}>Grade {v.quality}</StatusPill>
      </div>
    </div>
  );
}

/** Loads the voice list once the engine is usable, and again when the pairing token changes. */
function useVoiceList(s: AppState, dispatch: (a: Parameters<typeof voicesReducer>[1]) => void) {
  const state = s.health?.engine.state;
  const usable = state === "ready" || state === "unloaded";
  useEffect(() => {
    api
      .voices()
      .then((v) => dispatch({ type: "loaded", voices: v.voices, def: v.default }))
      .catch((e) => dispatch({ type: "failed", message: String(e.message ?? e) }));
  }, [usable, s.token, dispatch]);
}

export function VoicesPage({ s }: { s: AppState }) {
  const [st, dispatch] = useReducer(voicesReducer, undefined, initVoices);
  const { playing, error, toggle } = usePlayer();
  useVoiceList(s, dispatch);
  const shown = useMemo(() => filterVoices(st.voices, st.query, st.filter), [st.voices, st.query, st.filter]);
  const failure = error || st.error;
  return (
    <Page title="Voices" lead={`${st.voices.length} Kokoro voices. Press Preview to hear one.`} wide>
      {failure && <Banner tone="error">{failure}</Banner>}
      <div className="sk-tools">
        <TextInput icon="search" size="sm" aria-label="Search voices" placeholder="Search voices" value={st.query} onChange={(e) => dispatch({ type: "query", query: e.target.value })} />
        <Segmented label="Filter voices" value={st.filter} onChange={(f) => dispatch({ type: "filter", filter: f as VoiceFilter })} items={VOICE_FILTERS} />
      </div>
      {st.voices.length === 0 && !st.error ? (
        <EmptyState icon="microphone" title="No voices yet">
          Voices appear when the engine has been downloaded.
        </EmptyState>
      ) : (
        <div className="sk-voices" data-testid="voices">
          {shown.map((v) => (
            <VoiceCard
              key={v.id}
              voice={v}
              tone={AVATAR_TONES[st.voices.indexOf(v) % AVATAR_TONES.length]!}
              isDefault={v.id === st.def}
              playing={playing === v.id}
              onPreview={() => toggle(v.id, `Hello, I am ${v.name}. This is how I sound when reading to you.`)}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
