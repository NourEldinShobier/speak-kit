import { useEffect, useRef, useState } from "react";
import { Banner, Button, Icon, Kbd, ProgressBar, Radio, Select, SettingRow } from "@speakkit/ui";
import { hotkeyLabels, hotkeyText } from "../../../shared/dictation/keys";
import type { ModelCard, SpeechModelsView } from "../../../shared/speech-models/contract";
import { dictation } from "../dictation/api";
import { Pill } from "../dictation/HudPill";
import { useDictation } from "../dictation/useDictation";
import { models } from "../engines/api";
import { failureText, languageName, transferText } from "../engines/speech-text";
import { useSpeechModels } from "../engines/useSpeechModels";
import "../engines/speech-models.css";
import { Back, Foot, Frame } from "./Frame";
import { afterLanguage, checklist, defaultLanguage, FIRST_LANGUAGES, languageChoice, practiceDone, type DictationPhase } from "./dictation-step";

interface Props {
  /** The window was closed during setup and opened again on this step. */
  resumed: boolean;
  onBack(): void;
  onNext(): void;
}

const AT = 2;

function useMic(): "granted" | "denied" | "prompt" | "unknown" {
  const [state, setState] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");
  useEffect(() => {
    let live = true;
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => live && setState(p.state))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** F7: after a restart in the middle of setup, what is already in place, checked again every time the window opens. */
function Resume({ onContinue, onSkip }: { onContinue(): void; onSkip(): void }) {
  const d = useDictation();
  const { view } = useSpeechModels();
  const mic = useMic();
  const card = view?.models.find((m) => m.inUse) ?? view?.models[0];
  const rows = checklist({
    mic,
    hotkeyLabel: d ? hotkeyText(d.settings.hotkey) : "The hotkey",
    hotkeyReady: !!d?.hotkeyReady,
    hotkeyFailed: !!d?.hotkeyFailed,
    modelName: card?.name ?? "The speech model",
    modelBytes: card?.bytes ?? 0,
    modelInstalled: !!d?.modelInstalled,
  });
  const fix = (id: string | undefined) => {
    if (id === "fix-hotkey") void dictation.setEnabled(true);
    else if (id === "download" && card) void models.download(card.id);
  };
  return (
    <Frame at={AT} title="Welcome back" sub="Speak Kit restarted during setup. You are on Dictation, step 3 of 3. This is what is ready." foot={<Foot back={<Button variant="ghost" onClick={onSkip}>Skip setup</Button>}><Button variant="primary" size="lg" iconRight="arrow-right" onClick={onContinue}>Continue</Button></Foot>}>
      <section className="sk-checklist" aria-label="Setup checklist">
        <h2>Setup checklist</h2>
        <div className="lm-card">
          {rows.map((r) => (
            <SettingRow
              key={r.id}
              label={r.title}
              description={r.detail}
              control={
                r.ok ? (
                  <span className="sk-checklist__ok">
                    <Icon name="check" size={14} /> Ready
                  </span>
                ) : r.fix ? (
                  <Button onClick={() => fix(r.fix)}>{r.fix === "fix-hotkey" ? "Fix hotkey" : "Download"}</Button>
                ) : null
              }
            />
          ))}
        </div>
        <p className="sk-checklist__foot">The check runs again every time this window opens.</p>
      </section>
    </Frame>
  );
}

function LanguageScreen({ view, onBack, onSkip, onContinue }: { view: SpeechModelsView; onBack(): void; onSkip(): void; onContinue(language: string, found: boolean): void }) {
  const offered = view.table.map((r) => r.language);
  const [language, setLanguage] = useState(() => defaultLanguage(navigator.language, offered));
  const [found, setFound] = useState<string[] | null>(null);
  useEffect(() => {
    void models.scanDisk().then(
      (f) => setFound(f.map((x) => x.id)),
      () => setFound([]),
    );
  }, []);
  const choice = languageChoice(view, language, found ?? []);
  const others = offered.filter((l) => !(FIRST_LANGUAGES as readonly string[]).includes(l));
  const first = (FIRST_LANGUAGES as readonly string[]).filter((l) => offered.includes(l));
  const lookElsewhere = async () => {
    const r = await models.importFile("multilingual", "");
    if ("ok" in r && r.ok) setFound((f) => [...(f ?? []), r.id]);
  };
  return (
    <Frame
      at={AT}
      title="Choose your language"
      sub="Dictation is most accurate when it knows what you speak. Speak Kit picks the speech model that fits it."
      foot={
        <Foot back={<Back onClick={onBack} />}>
          <Button variant="ghost" onClick={onSkip}>
            Skip dictation
          </Button>
          <Button variant="primary" size="lg" iconRight="arrow-right" disabled={!choice} onClick={() => choice && onContinue(language, !!found?.includes(choice.model.id))}>
            Continue
          </Button>
        </Foot>
      }
    >
      <fieldset className="sk-lang" aria-label="Language you dictate in">
        <legend>Language you dictate in</legend>
        <div className="lm-card">
          {first.map((code) => {
            const c = languageChoice(view, code, found ?? []);
            return (
              <label key={code} className="lm-row sk-lang__row">
                <Radio name="dictation-language" aria-label={languageName(code)} checked={language === code} onChange={() => setLanguage(code)} />
                <span className="lm-row__text">
                  <span className="lm-row__label">{languageName(code)}</span>
                  <span className="lm-row__desc">
                    {c?.detail}
                    {c?.noDownload && " No download needed."}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {others.length > 0 && (
        <SettingRow className="lm-row--control" label="Other language" control={<Select label="Other language" value={others.includes(language) ? language : "none"} onChange={(c) => c !== "none" && setLanguage(c)} options={[{ value: "none", label: "Choose…" }, ...others.map((c) => ({ value: c, label: languageName(c) }))]} />} />
      )}
      {found && found.length === 0 && (
        <p className="sk-lang__note">
          No speech models were found on this computer. The model downloads when you press Continue.{" "}
          <button type="button" className="sk-link" onClick={() => void lookElsewhere()}>
            Look in another folder
          </button>
        </p>
      )}
      <p className="sk-lang__note">You can change the language or the model later in Dictation and Engines.</p>
    </Frame>
  );
}

function ModelScreen({ view, card, onBack, onContinue, onSkip }: { view: SpeechModelsView; card: ModelCard; onBack(): void; onContinue(): void; onSkip(): void }) {
  const failed = !!card.failure;
  const blocked = card.blocked ?? view.floor?.message;
  const fast = view.models.find((m) => m.tag === "Fast" && !m.installed && m.id !== card.id);
  const retry = () => void models.download(card.id);
  return (
    <Frame
      at={AT}
      title={card.installed ? `${card.name} is ready` : failed ? "The speech model could not be downloaded" : `Downloading ${card.name}`}
      sub={card.installed ? "Everything is on this computer. Dictation works offline." : "One time only. After this, dictation works offline."}
      foot={
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
      }
    >
      {blocked && !card.installed && (
        <Banner tone="warning" title="This computer is too slow for the accurate model" action={fast ? <Button onClick={() => void models.download(fast.id)}>Use {fast.name}</Button> : undefined}>
          {blocked}
        </Banner>
      )}
      {failed && (
        <Banner tone="error" title="Download failed" action={<Button onClick={retry}>Try again</Button>}>
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

function Practice({ onBack, onNext, onSkip }: { onBack(): void; onNext(): void; onSkip(): void }) {
  const d = useDictation();
  const [text, setText] = useState("");
  const done = practiceDone(text);
  const started = useRef(false);
  const since = useRef(Date.now());
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void dictation.setEnabled(true); // the hotkey has to be live for the practice
  }, []);
  const hotkey = d?.settings.hotkey ?? "ControlRight";
  return (
    <Frame
      at={AT}
      title={done ? "Dictation works" : "Try dictation here"}
      sub={done ? "Your words appeared in the field." : "Click the field, hold the key, say a sentence, then let go. Your words appear in the field."}
      foot={
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
      }
    >
      <div className="sk-practice__key">
        <b>Your hotkey</b> {hotkeyLabels(hotkey).map((k) => <Kbd key={k}>{k}</Kbd>)} <span>{d?.settings.mode === "toggle" ? "Press to toggle" : "Hold to talk"}</span>
      </div>
      {d?.hotkeyFailed && (
        <Banner tone="warning" title="The hotkey could not start" action={<Button onClick={() => void dictation.setEnabled(true)}>Fix hotkey</Button>}>
          Another app may be using it. You can change it later in Dictation.
        </Banner>
      )}
      <textarea className="sk-practice__field" aria-label="Practice field" placeholder="Your words appear here" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      {done ? (
        <p className="sk-practice__ok" role="status">
          <Icon name="circle-check" size={14} /> It worked. You can use the hotkey in any app.
        </p>
      ) : (
        <div className="sk-practice__pill">
          <Pill view={{ kind: "recording", locked: false, startedAt: since.current, level: 0.6, hotkey }} />
          <p>This pill appears near the bottom of your screen while you talk.</p>
        </div>
      )}
    </Frame>
  );
}

/** Setup step 3: language first (the model that fits is chosen and its size shown), the model, then a practice with the hotkey. */
export function DictationStep({ resumed, onBack, onNext }: Props) {
  const { view, failed } = useSpeechModels();
  const d = useDictation();
  const [phase, setPhase] = useState<DictationPhase>("language");
  const [welcomeBack, setWelcomeBack] = useState(resumed);
  const [chosen, setChosen] = useState<string | null>(null);

  if (welcomeBack) return <Resume onContinue={() => (setWelcomeBack(false), setPhase(d?.modelInstalled ? "practice" : "language"))} onSkip={onNext} />;
  if (!view || (d && !d.supported))
    return (
      <Frame at={AT} title={d && !d.supported ? "Dictation is not available here yet" : "Checking this computer"} sub={d && !d.supported ? "Reading aloud and the browser extension work. Dictation will come to this computer in an update." : failed ? "Speak Kit could not read its speech models. You can set dictation up later." : "One moment."} foot={<Foot back={<Back onClick={onBack} />}><Button variant="primary" size="lg" iconRight="arrow-right" onClick={onNext}>Continue</Button></Foot>} />
    );

  const card = view.models.find((m) => m.id === chosen);
  const skip = () => {
    void models.continueWithoutModel();
    onNext();
  };
  if (phase === "practice") return <Practice onBack={() => setPhase(card && !card.installed ? "model" : "language")} onNext={onNext} onSkip={onNext} />;
  if (phase === "model" && card)
    return <ModelScreen view={view} card={card} onBack={() => setPhase("language")} onContinue={() => setPhase("practice")} onSkip={skip} />;
  return (
    <LanguageScreen
      view={view}
      onBack={onBack}
      onSkip={skip}
      onContinue={(language, found) => {
        const choice = languageChoice(view, language, found ? [view.table.find((r) => r.language === language)!.recommended] : []);
        if (!choice) return;
        void dictation.patchSettings({ language: language as never });
        setChosen(choice.model.id);
        const next = afterLanguage(choice, found);
        // Nothing downloads until this press: choosing a language only picked a model.
        if (next === "use") void models.use(choice.model.id).then(() => setPhase("practice"));
        else if (next === "adopt")
          void models
            .adoptFound([choice.model.id])
            .then(() => models.use(choice.model.id))
            .then(() => setPhase("practice"));
        else {
          void models.download(choice.model.id);
          setPhase("model");
        }
      }}
    />
  );
}
