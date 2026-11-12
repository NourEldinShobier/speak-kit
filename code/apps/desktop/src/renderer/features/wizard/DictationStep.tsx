import { useEffect, useState } from "react";
import { Button, Icon, SettingRow } from "@speakkit/ui";
import { hotkeyText } from "../../../shared/dictation/keys";
import type { SpeechModelsView } from "../../../shared/speech-models/contract";
import { dictation, useDictation } from "../dictation";
import { models, useSpeechModels } from "../engines";
import { Back, Foot, Frame } from "./Frame";
import { afterLanguage, checklist, languageChoice, type ChecklistRow, type DictationPhase } from "./dictation-step";
import { LanguageScreen, ModelScreen, Practice } from "./DictationScreens";

interface Props {
  /** The window was closed during setup and opened again on this step. */
  resumed: boolean;
  onBack(): void;
  onNext(): void;
}

const AT = 2;
type Mic = "granted" | "denied" | "prompt" | "unknown";

/** The microphone permission, read when the step opens and again when the window gets focus (after a system setting changed), never on a timer. */
function useMic(): Mic {
  const [state, setState] = useState<Mic>("unknown");
  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (live) setState(p.state);
      } catch {
        // a window that cannot tell leaves the row as "allowed": the microphone window reports a real refusal itself
      }
    };
    void read();
    window.addEventListener("focus", read);
    return () => {
      live = false;
      window.removeEventListener("focus", read);
    };
  }, []);
  return state;
}

const FIX_LABELS = { "fix-hotkey": "Fix hotkey", download: "Download", "open-mic-settings": "Open settings" } as const;

function ChecklistCard({ rows, fix }: { rows: ChecklistRow[]; fix(id: ChecklistRow["fix"]): void }) {
  return (
    <section className="sk-checklist" aria-label="Setup checklist">
      <h2>Setup checklist</h2>
      <div className="lm-card">
        {rows.map((r) => (
          <SettingRow
            key={r.id}
            label={
              <span className="sk-checklist__label">
                <Icon name={r.ok ? "check" : "alert-triangle"} size={14} />
                {r.title}
              </span>
            }
            description={r.detail}
            control={
              r.ok ? (
                <span className="sk-checklist__ok">
                  <Icon name="check" size={14} /> Ready
                </span>
              ) : (
                r.fix && <Button onClick={() => fix(r.fix)}>{FIX_LABELS[r.fix]}</Button>
              )
            }
          />
        ))}
      </div>
      <p className="sk-checklist__foot">The check runs again every time this window opens.</p>
    </section>
  );
}

/** After a restart in the middle of setup: what is already in place, checked again every time the window opens. */
function Resume({ onContinue, onSkip }: { onContinue(): void; onSkip(): void }) {
  const d = useDictation();
  const { view } = useSpeechModels();
  const card = view?.models.find((m) => m.inUse) ?? view?.models[0];
  const rows = checklist({
    mic: useMic(),
    hotkeyLabel: d ? hotkeyText(d.settings.hotkey) : "The hotkey",
    hotkeyReady: !!d?.hotkeyReady,
    hotkeyFailed: !!d?.hotkeyFailed,
    modelName: card?.name ?? "The speech model",
    modelBytes: card?.bytes ?? 0,
    modelInstalled: !!d?.modelReady, // ready means loaded, not only on disk
  });
  const fix = (id: ChecklistRow["fix"]) => {
    if (id === "fix-hotkey") void dictation.setEnabled(true);
    else if (id === "download" && card) void models.download(card.id);
    else if (id === "open-mic-settings") void dictation.openMicrophoneSettings();
  };
  const skip = (
    <Button variant="ghost" onClick={onSkip}>
      Skip setup
    </Button>
  );
  const next = (
    <Button variant="primary" size="lg" iconRight="arrow-right" onClick={onContinue}>
      Continue
    </Button>
  );
  return (
    <Frame at={AT} title="Welcome back" sub="Speak Kit restarted during setup. You are on Dictation, step 3 of 3. This is what is ready." foot={<Foot back={skip}>{next}</Foot>}>
      <ChecklistCard rows={rows} fix={fix} />
    </Frame>
  );
}

function Waiting({ unsupported, failed, onBack, onNext }: { unsupported: boolean; failed: boolean; onBack(): void; onNext(): void }) {
  let sub = "One moment.";
  if (unsupported) sub = "Reading aloud and the browser extension work. Dictation will come to this computer in an update.";
  else if (failed) sub = "Speak Kit could not read its speech models. You can set dictation up later.";
  return (
    <Frame
      at={AT}
      title={unsupported ? "Dictation is not available here yet" : "Checking this computer"}
      sub={sub}
      foot={
        <Foot back={<Back onClick={onBack} />}>
          <Button variant="primary" size="lg" iconRight="arrow-right" onClick={onNext}>
            Continue
          </Button>
        </Foot>
      }
    />
  );
}

/** Continue on the language screen: the language is saved, then the model is used, adopted from disk, or (only now) downloaded. */
async function startModel(view: SpeechModelsView, language: string, found: boolean): Promise<{ id: string; phase: DictationPhase } | undefined> {
  const choice = languageChoice(view, language, found ? [view.table.find((r) => r.language === language)!.recommended] : []);
  if (!choice) return undefined;
  void dictation.patchSettings({ language: language as never });
  const id = choice.model.id;
  const next = afterLanguage(choice, found);
  if (next === "download") {
    void models.download(id);
    return { id, phase: "model" };
  }
  if (next === "adopt") await models.adoptFound([id]);
  await models.use(id);
  return { id, phase: "practice" };
}

/** Setup step 3: language first (the model that fits is chosen and its size shown), the model, then a practice with the hotkey. */
export function DictationStep({ resumed, onBack, onNext }: Props) {
  const { view, failed } = useSpeechModels();
  const d = useDictation();
  const [phase, setPhase] = useState<DictationPhase>("language");
  const [welcomeBack, setWelcomeBack] = useState(resumed);
  const [chosen, setChosen] = useState<string | null>(null);

  if (welcomeBack) return <Resume onContinue={() => (setWelcomeBack(false), setPhase(d?.modelInstalled ? "practice" : "language"))} onSkip={onNext} />;
  if (!view || (d && !d.supported)) return <Waiting unsupported={!!d && !d.supported} failed={failed} onBack={onBack} onNext={onNext} />;

  const card = view.models.find((m) => m.id === chosen);
  const skip = () => {
    void models.continueWithoutModel();
    onNext();
  };
  if (phase === "practice") return <Practice onBack={() => setPhase(card && !card.installed ? "model" : "language")} onNext={onNext} onSkip={onNext} />;
  if (phase === "model" && card) return <ModelScreen view={view} card={card} onBack={() => setPhase("language")} onContinue={() => setPhase("practice")} onSkip={skip} />;
  const onContinue = async (language: string, found: boolean) => {
    const started = await startModel(view, language, found);
    if (!started) return;
    setChosen(started.id);
    setPhase(started.phase);
  };
  return <LanguageScreen view={view} onBack={onBack} onSkip={skip} onContinue={(language, found) => void onContinue(language, found)} />;
}
