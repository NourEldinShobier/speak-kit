import { useEffect, useMemo, useReducer } from "react";
import { Avatar, Badge, Banner, Button, EmptyState, StatusPill, TextInput, type Tone } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { usePlayer } from "../../pages";
import { api, cleanError, Page } from "../../ui";
import { filterVoices, genderLabel, initVoices, langLabel, previewText, voicesReducer } from "./model";
import { GRADE_TONE } from "./grade";
import { useT } from "../../i18n";
import "../../../shared/i18n/packs/voices";

const AVATAR_TONES: Tone[] = ["blue", "orange", "green", "purple", "red", "yellow"];

interface CardProps {
  voice: Voice;
  tone: Tone;
  isDefault: boolean;
  playing: boolean;
  onPreview(): void;
}

function VoiceCard({ voice: v, tone, isDefault, playing: on, onPreview }: CardProps) {
  const { t } = useT();
  return (
    <div className="sk-voice" data-voice={v.id} role="group" aria-label={v.name}>
      <div className="sk-voice__h">
        <Avatar name={v.name} tone={tone} />
        <div style={{ flex: 1 }}>
          <b>
            {v.name}
            {isDefault && <Badge>{t("v.default")}</Badge>}
          </b>
          <small>
            {langLabel(v)} · {genderLabel(v)}
          </small>
        </div>
      </div>
      <div className="sk-voice__t">{v.traits}</div>
      <div className="sk-voice__f">
        <Button
          size="sm"
          variant={on ? "primary" : "secondary"}
          iconLeft={on ? "player-stop" : "player-play"}
          aria-label={t(on ? "v.stopAria" : "v.previewAria", { name: v.name })}
          onClick={onPreview}
        >
          {t(on ? "v.stop" : "v.preview")}
        </Button>
        <StatusPill tone={GRADE_TONE[v.quality]}>{t("v.gradeLabel", { grade: v.quality })}</StatusPill>
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
      .then((v) => dispatch({ type: "loaded", voices: v.voices }))
      .catch((e) => dispatch({ type: "failed", message: cleanError(e) }));
  }, [usable, s.token, dispatch]);
}

function Toolbar({ query, dispatch }: { query: string; dispatch: (a: Parameters<typeof voicesReducer>[1]) => void }) {
  const { t } = useT();
  return (
    <div className="sk-tools">
      <TextInput className="sk-voice-search" icon="search" aria-label={t("v.search")} placeholder={t("v.search")} value={query} onChange={(e) => dispatch({ type: "query", query: e.target.value })} />
    </div>
  );
}

interface GridProps {
  shown: Voice[];
  defaultId: string;
  playing: string | null;
  tone(v: Voice): Tone;
  preview(v: Voice): void;
}

function VoiceGrid({ shown, defaultId, playing, tone, preview }: GridProps) {
  return (
    <div className="sk-voices" data-testid="voices">
      {shown.map((v) => (
        <VoiceCard key={v.id} voice={v} tone={tone(v)} isDefault={v.id === defaultId} playing={playing === v.id} onPreview={() => preview(v)} />
      ))}
    </div>
  );
}

export function VoicesPage({ s, onFixPronunciation }: { s: AppState; onFixPronunciation?: () => void }) {
  const { t } = useT();
  const [st, dispatch] = useReducer(voicesReducer, undefined, initVoices);
  const { playing, error, toggle } = usePlayer();
  useVoiceList(s, dispatch);
  const shown = useMemo(() => filterVoices(st.voices, st.query), [st.voices, st.query]);
  const failure = error || st.error;
  const tone = (v: Voice) => AVATAR_TONES[st.voices.indexOf(v) % AVATAR_TONES.length]!;
  const preview = (v: Voice) => void toggle(v.id, previewText(v.name));
  return (
    <Page title={t("v.title")} lead={t("v.lead", { n: st.voices.length })} wide>
      {failure && <Banner tone="error">{failure}</Banner>}
      {onFixPronunciation && (
        <Banner tone="info" title={t("v.fixTitle")} action={<Button onClick={onFixPronunciation}>{t("v.fixAction")}</Button>} role="status">
          {t("v.fixBody")}
        </Banner>
      )}
      <Toolbar query={st.query} dispatch={dispatch} />
      {st.voices.length === 0 && !st.error ? (
        <EmptyState icon="microphone" title={t("v.empty")}>
          {t("v.emptyBody")}
        </EmptyState>
      ) : (
        <VoiceGrid shown={shown} tone={tone} defaultId={s.config.voice} playing={playing} preview={preview} />
      )}
    </Page>
  );
}
