import { Button, Icon, Kbd, ProgressBar } from "@speakkit/ui";
import type { DictationStatus, ModelView } from "../../../shared/dictation/contract";
import { hotkeyLabels } from "../../../shared/dictation/keys";
import { dictation } from "./api";
import { etaText, mb } from "./model";

function Head({ title, step }: { title: string; step: string }) {
  return (
    <div className="dict-card__head">
      <span className="dict-card__tile">
        <Icon name="microphone" size={18} />
      </span>
      <div>
        <div className="dict-card__title">{title}</div>
        <div className="dict-card__step">{step}</div>
      </div>
    </div>
  );
}

function Failed({ message, model }: { message: string; model: ModelView }) {
  return (
    <div className="lm-card dict-card" role="alert">
      <Head title="Dictation could not get ready" step="Something went wrong" />
      <p className="dict-card__text">{message}</p>
      <div className="dict-card__foot">
        <Button onClick={() => void dictation.setEnabled(false)}>Turn off</Button>
        <Button variant="primary" onClick={() => void dictation.downloadModel(model.id)}>
          Try again
        </Button>
      </div>
    </div>
  );
}

function Downloading({ model }: { model: ModelView }) {
  const p = model.progress?.kind === "downloading" ? model.progress : null;
  const pct = Math.round((p?.fraction ?? 0) * 100);
  const done = Math.round(((p?.fraction ?? 0) * model.bytes) / 1e6);
  const cancel = async () => {
    await dictation.cancelDownload();
    await dictation.setEnabled(false);
  };
  return (
    <div className="lm-card dict-card" data-testid="first-run-download">
      <Head title="Set up dictation" step="Step 1 of 2" />
      <p className="dict-card__text">Speak Kit needs a speech model on this computer. It downloads once, then dictation works offline.</p>
      <div className="dict-card__bar">
        <div className="dict-card__row">
          <b>{model.name}</b>
          <span>{pct}%</span>
        </div>
        <ProgressBar block thin value={pct} label="Speech model download" />
        <div className="dict-card__sub">{`${done} of ${mb(model.bytes)}. ${etaText(p?.etaSeconds)}`.trim()}</div>
      </div>
      <div className="dict-card__foot">
        <Button onClick={() => void cancel()}>Cancel</Button>
      </div>
    </div>
  );
}

function Preparing({ model, hotkey }: { model: ModelView; hotkey: string }) {
  return (
    <div className="lm-card dict-card" data-testid="first-run-preparing">
      <Head title="Preparing the model" step="Step 2 of 2" />
      <p className="dict-card__text">Getting {model.name} ready. This takes a few seconds the first time.</p>
      <ProgressBar block thin label="Preparing the speech model" />
      <div className="dict-card__hint">
        When it is ready, hold{" "}
        {hotkeyLabels(hotkey).map((k) => (
          <Kbd key={k} small>
            {k}
          </Kbd>
        ))}{" "}
        and speak.
      </div>
    </div>
  );
}

/** What the page shows while the speech model is not usable yet: step 1 downloads it, step 2 loads it, a failure offers another try. */
export function FirstRunCard({ status }: { status: DictationStatus }) {
  const model = status.models.find((m) => m.selected) ?? status.models[0]!;
  if (status.modelError) return <Failed message={status.modelError} model={model} />;
  if (model.progress?.kind === "downloading" || !model.installed) return <Downloading model={model} />;
  return <Preparing model={model} hotkey={status.settings.hotkey} />;
}
