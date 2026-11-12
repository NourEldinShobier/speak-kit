import { useEffect, useRef, useState } from "react";
import { Banner, Button, Icon, Kbd, ProgressBar, Radio, Select, SettingRow } from "@speakkit/ui";
import { hotkeyLabels } from "../../../shared/dictation/keys";
import type { ModelCard, SpeechModelsView } from "../../../shared/speech-models/contract";
import { dictation, Pill, useDictation } from "../dictation";
import { models } from "../engines";
import { failureText, languageName, transferText } from "../../speech-text";
import { Back, Foot, Frame } from "./Frame";
import { defaultLanguage, FIRST_LANGUAGES, languageChoice, practiceStage, seenPress, type LanguageChoice, type PracticeStage } from "./dictation-step";

const AT = 2;

function LanguageRow({ code, choice, checked, onPick }: { code: string; choice: LanguageChoice | undefined; checked: boolean; onPick(): void }) {
  return (
    <label className="lm-row sk-lang__row">
      <Radio name="dictation-language" aria-label={languageName(code)} checked={checked} onChange={onPick} />
      <span className="lm-row__text">
        <span className="lm-row__label">{languageName(code)}</span>
        <span className="lm-row__desc">
          {choice?.detail}
          {choice?.noDownload && " No download needed."}
        </span>
      </span>
    </label>
  );
}

function OtherLanguage({ others, language, onPick }: { others: string[]; language: string; onPick(code: string): void }) {
  if (others.length === 0) return null;
  return (
    <SettingRow
      className="lm-row--control"
      label="Other language"
      control={
        <Select
          label="Other language"
          value={others.includes(language) ? language : "none"}
          onChange={(c) => c !== "none" && onPick(c)}
          options={[{ value: "none", label: "Choose…" }, ...others.map((c) => ({ value: c, label: languageName(c) }))]}
        />
      }
    />
  );
}

/** Which models are already on this computer: a read-only scan when the screen opens; null until it answered. */
function useFoundModels(): [string[] | null, (id: string) => void] {
  const [found, setFound] = useState<string[] | null>(null);
  useEffect(() => {
    void models.scanDisk().then(
      (f) => setFound(f.map((x) => x.id)),
      () => setFound([]),
    );
  }, []);
  return [found, (id) => setFound((f) => [...(f ?? []), id])];
}

export function LanguageScreen({ view, onBack, onSkip, onContinue }: { view: SpeechModelsView; onBack(): void; onSkip(): void; onContinue(language: string, found: boolean): void }) {
  const offered = view.table.map((r) => r.language);
  const [language, setLanguage] = useState(() => defaultLanguage(navigator.language, offered));
  const [found, addFound] = useFoundModels();
  const choice = languageChoice(view, language, found ?? []);
  const shown = FIRST_LANGUAGES as readonly string[];
  const lookElsewhere = async () => {
    const r = await models.importFile("multilingual", "");
    if ("ok" in r && r.ok) addFound(r.id);
  };
  const foot = (
    <Foot back={<Back onClick={onBack} />}>
      <Button variant="ghost" onClick={onSkip}>
        Skip dictation
      </Button>
      <Button variant="primary" size="lg" iconRight="arrow-right" disabled={!choice} onClick={() => choice && onContinue(language, !!found?.includes(choice.model.id))}>
        Continue
      </Button>
    </Foot>
  );
  return (
    <Frame at={AT} title="Choose your language" sub="Dictation is most accurate when it knows what you speak. Speak Kit picks the speech model that fits it." foot={foot}>
      <fieldset className="sk-lang" aria-label="Language you dictate in">
        <legend>Language you dictate in</legend>
        <div className="lm-card">
          {offered
            .filter((l) => shown.includes(l))
            .map((code) => (
              <LanguageRow key={code} code={code} choice={languageChoice(view, code, found ?? [])} checked={language === code} onPick={() => setLanguage(code)} />
            ))}
        </div>
      </fieldset>
      <OtherLanguage others={offered.filter((l) => !shown.includes(l))} language={language} onPick={setLanguage} />
      {found && found.length === 0 && (
        <p className="sk-lang__note">
          No speech models were found on this computer. The model downloads when you press Continue.{" "}
          <button type="button" className="sk-linkbtn" onClick={() => void lookElsewhere()}>
            Look in another folder
          </button>
        </p>
      )}
      <p className="sk-lang__note">You can change the language or the model later in Dictation and Engines.</p>
    </Frame>
  );
}

function modelTitle(card: ModelCard): string {
  if (card.installed) return `${card.name} is ready`;
  return card.failure ? "The speech model could not be downloaded" : `Downloading ${card.name}`;
}

export function ModelScreen({ view, card, onBack, onContinue, onSkip }: { view: SpeechModelsView; card: ModelCard; onBack(): void; onContinue(): void; onSkip(): void }) {
  const blocked = card.blocked ?? view.floor?.message;
  const fast = view.models.find((m) => m.tag === "Fast" && !m.installed && m.id !== card.id);
  const foot = (
    <Foot back={<Back onClick={onBack} />}>
      {!card.installed && (
        <Button variant="ghost" onClick={onSkip}>
          Continue without a model
        </Button>
      )}
      <Button variant="primary" size="lg" iconRight="arrow-right" disabled={!card.installed} onClick={onContinue}>
        Continue
      </Button>
    </Foot>
  );
  return (
    <Frame at={AT} title={modelTitle(card)} sub={card.installed ? "Everything is on this computer. Dictation works offline." : "One time only. After this, dictation works offline."} foot={foot}>
      {blocked && !card.installed && (
        <Banner tone="warning" title="This computer is too slow for the accurate model" action={fast ? <Button onClick={() => void models.download(fast.id)}>Use {fast.name}</Button> : undefined}>
          {blocked}
        </Banner>
      )}
      {card.failure && (
        <Banner tone="error" title="Download failed" action={<Button onClick={() => void models.download(card.id)}>Try again</Button>}>
          {failureText(card)}
        </Banner>
      )}
      {card.transfer && !card.installed && (
        <div data-testid="dictation-download">
          <ProgressBar block thin value={card.transfer.state === "preparing" ? undefined : Math.round(card.transfer.fraction * 100)} label={`${card.name} download`} />
          <p className="sk-lang__note" aria-live="polite">
            {transferText(card)}
          </p>
        </div>
      )}
    </Frame>
  );
}

function PracticeField({ text, setText, hotkey, since, stage }: { text: string; setText(t: string): void; hotkey: string; since: number; stage: PracticeStage }) {
  const d = useDictation();
  return (
    <>
      <div className="sk-practice__key">
        <b>Your hotkey</b>{" "}
        {hotkeyLabels(hotkey).map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}{" "}
        <span>{d?.settings.mode === "toggle" ? "Press to toggle" : "Hold to talk"}</span>
      </div>
      {stage === "failed" && (
        <Banner tone="warning" title="The hotkey could not start" action={<Button onClick={() => void dictation.setEnabled(true)}>Fix hotkey</Button>}>
          Another app may be using it. You can change it later in Dictation.
        </Banner>
      )}
      <textarea className="sk-practice__field" aria-label="Practice field" placeholder="Your words appear here" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      {stage === "waiting" && (
        <p className="sk-practice__wait" role="status">
          <Icon name="loader-2" size={14} className="lm-spin" /> Getting the hotkey ready. Try it when this line is gone.
        </p>
      )}
      {stage === "worked" && (
        <p className="sk-practice__ok" role="status">
          <Icon name="circle-check" size={14} /> It worked. You can use the hotkey in any app.
        </p>
      )}
      {(stage === "ready" || stage === "listening") && (
        <div className="sk-practice__pill">
          <Pill view={{ kind: "recording", locked: false, startedAt: since, level: 0.6, hotkey }} />
          <p>This pill appears near the bottom of your screen while you talk.</p>
        </div>
      )}
    </>
  );
}

const PRACTICE_SUB: Record<PracticeStage, string> = {
  waiting: "Speak Kit is starting the hotkey. This takes a moment.",
  failed: "The hotkey did not start. Fix it, or skip this step and set it up later in Dictation.",
  ready: "Click the field, hold the key, say a sentence, then let go. Your words appear in the field.",
  listening: "Listening. Let go of the key when you are done.",
  worked: "Your press was heard.",
};

export function Practice({ onBack, onNext, onSkip }: { onBack(): void; onNext(): void; onSkip(): void }) {
  const d = useDictation();
  const [text, setText] = useState("");
  const [pressed, setPressed] = useState(false);
  const since = useRef(Date.now());
  useEffect(() => {
    void dictation.setEnabled(true); // the hotkey has to be live for the practice
  }, []);
  const phase = d?.phase ?? "idle";
  useEffect(() => setPressed((p) => seenPress(p, phase)), [phase]);
  const stage = practiceStage({ hotkeyReady: !!d?.hotkeyReady, hotkeyFailed: !!d?.hotkeyFailed, phase, pressed, text });
  const done = stage === "worked";
  const foot = (
    <Foot back={<Back onClick={onBack} />}>
      {!done && (
        <Button variant="ghost" onClick={onSkip}>
          Skip practice
        </Button>
      )}
      <Button variant="primary" size="lg" iconRight="arrow-right" disabled={!done} onClick={onNext}>
        Continue
      </Button>
    </Foot>
  );
  const sub = text.trim() ? "Your words appeared in the field." : PRACTICE_SUB[stage];
  return (
    <Frame at={AT} title={done ? "Dictation works" : "Try dictation here"} sub={sub} foot={foot}>
      <PracticeField text={text} setText={setText} hotkey={d?.settings.hotkey ?? "ControlRight"} since={since.current} stage={stage} />
    </Frame>
  );
}
