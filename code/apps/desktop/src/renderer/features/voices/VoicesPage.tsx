import { lazy, Suspense, useEffect, useMemo, useReducer, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Avatar, Badge, Banner, Button, EmptyState, Select, StatusPill, TextInput, type Tone } from "@speakkit/ui";
import { plural, type EngineList, type Voice } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { usePlayer } from "../../pages";
import { api, cleanError, Page } from "../../ui";
import { cloningAvailability, CloneButton, CloneFlow, ClonedVoices, CloningUnavailable } from "../cloning";
import type { DrawerState } from "./drawer";
import { filterVoices, genderLabel, initVoices, langLabel, previewText, VOICE_FILTERS, voiceFilterLabel, voicesReducer, type VoiceFilter } from "./model";
import { GRADE_TONE } from "./grade";

// Loaded when a voice is first opened, with the drawer's reducer: the page everyone sees first stays inside the bundle budget (tests/bundle.test.ts).
const DrawerHost = lazy(() => import("./DrawerHost").then((m) => ({ default: m.DrawerHost })));

const AVATAR_TONES: Tone[] = ["blue", "orange", "green", "purple", "red", "yellow"];

interface CardProps {
  voice: Voice;
  tone: Tone;
  isDefault: boolean;
  playing: boolean;
  onPreview(): void;
  onOpen(): void;
}

/** The card opens the voice drawer when it is clicked or when Enter or Space is pressed on it; its Preview button does not. */
function VoiceCard({ voice: v, tone, isDefault, playing: on, onPreview, onOpen }: CardProps) {
  const click = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest("button")) onOpen();
  };
  const key = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onOpen();
  };
  return (
    <div className="sk-voice" data-voice={v.id} role="group" tabIndex={0} aria-label={`${v.name}, show details`} onClick={click} onKeyDown={key}>
      <div className="sk-voice__h">
        <Avatar name={v.name} tone={tone} />
        <div style={{ flex: 1 }}>
          <b>
            {v.name}
            {isDefault && <Badge>Default</Badge>}
          </b>
          <small>
            {langLabel(v)} · {genderLabel(v)}
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

/** Loads the voice list once the engine is usable, and again when the pairing token or the engine in use changes. */
function useVoiceList(s: AppState, dispatch: (a: Parameters<typeof voicesReducer>[1]) => void) {
  const state = s.health?.engine.state;
  const usable = state === "ready" || state === "unloaded";
  const engine = s.health?.engine.id;
  useEffect(() => {
    api
      .voices()
      .then((v) => dispatch({ type: "loaded", voices: v.voices }))
      .catch((e) => dispatch({ type: "failed", message: cleanError(e) }));
  }, [usable, engine, s.token, dispatch]);
}

/** The engine list, for the cloning button: loaded with the page and again when the engine in use or its state changes. */
function useEngineList(s: AppState): EngineList | null {
  const [list, setList] = useState<EngineList | null>(null);
  const key = `${s.health?.engine.id}:${s.health?.engine.state}`;
  useEffect(() => {
    api.engines().then(setList, () => setList(null)); // an old server has no engine list: cloning then stays off
  }, [key]);
  return list;
}

function Toolbar({ query, filter, dispatch }: { query: string; filter: VoiceFilter; dispatch: (a: Parameters<typeof voicesReducer>[1]) => void }) {
  return (
    <div className="sk-tools">
      <TextInput className="sk-voice-search" icon="search" aria-label="Search voices" placeholder="Search voices" value={query} onChange={(e) => dispatch({ type: "query", query: e.target.value })} />
      <Select
        className="sk-voice-filter"
        label="Filter voices"
        value={filter}
        onChange={(f) => dispatch({ type: "filter", filter: f as VoiceFilter })}
        options={VOICE_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
        renderValue={(o) => voiceFilterLabel((o?.value ?? "all") as VoiceFilter)}
      />
    </div>
  );
}

const lead = (n: number, engine: string | undefined) =>
  `${engine === "chatterbox" ? plural(n, "Chatterbox voice", "Chatterbox voices") : plural(n, "Kokoro voice", "Kokoro voices")}. Press Preview to hear one.`;

interface GridProps {
  shown: Voice[];
  defaultId: string;
  playing: string | null;
  tone(v: Voice): Tone;
  preview(v: Voice): void;
  onOpen(id: string): void;
}

function VoiceGrid({ shown, defaultId, playing, tone, preview, onOpen }: GridProps) {
  return (
    <div className="sk-voices" data-testid="voices">
      {shown.map((v) => (
        <VoiceCard key={v.id} voice={v} tone={tone(v)} isDefault={v.id === defaultId} playing={playing === v.id} onPreview={() => preview(v)} onOpen={() => onOpen(v.id)} />
      ))}
    </div>
  );
}

export function VoicesPage({ s, onGo }: { s: AppState; onGo?: (page: "engines") => void }) {
  const [st, dispatch] = useReducer(voicesReducer, undefined, initVoices);
  const [cloning, setCloning] = useState(false);
  const [reload, setReload] = useState(0);
  const { playing, error, toggle } = usePlayer();
  useVoiceList(s, dispatch);
  const engines = useEngineList(s);
  const availability = cloningAvailability(engines);
  const stock = useMemo(() => st.voices.filter((v) => !v.cloned), [st.voices]);
  const shown = useMemo(() => filterVoices(stock, st.query, st.filter), [stock, st.query, st.filter]);
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "closed" });
  const failure = error || st.error;
  const closeFlow = () => {
    setCloning(false);
    setReload((n) => n + 1);
  };
  const tone = (v: Voice) => AVATAR_TONES[stock.indexOf(v) % AVATAR_TONES.length]!;
  const preview = (v: Voice) => void toggle(v.id, previewText(v.name));
  const makeDefault = (id: string) => void api.patchConfig({ voice: id }).catch((e) => dispatch({ type: "failed", message: cleanError(e) }));
  if (cloning) return <CloneFlow s={s} onClose={closeFlow} />;
  return (
    <>
      <Page title="Voices" lead={lead(stock.length, s.health?.engine.id)} wide action={<CloneButton availability={availability} onClick={() => setCloning(true)} />}>
        <CloningUnavailable availability={availability} onOpenEngines={() => onGo?.("engines")} />
        {failure && <Banner tone="error">{failure}</Banner>}
        <ClonedVoices reload={reload} />
        <Toolbar query={st.query} filter={st.filter} dispatch={dispatch} />
        {stock.length === 0 && !st.error ? (
          <EmptyState icon="microphone" title="No voices yet">
            Voices appear when the engine has been downloaded.
          </EmptyState>
        ) : (
          <VoiceGrid shown={shown} tone={tone} defaultId={s.config.voice} playing={playing} preview={preview} onOpen={(id) => setDrawer({ kind: "open", id })} />
        )}
      </Page>
      {drawer.kind === "open" && (
        <Suspense fallback={null}>
          <DrawerHost state={drawer} onChange={setDrawer} voices={shown} defaultId={s.config.voice} playing={playing} tone={tone} preview={preview} makeDefault={makeDefault} />
        </Suspense>
      )}
    </>
  );
}
