import { useState } from "react";
import { Banner, Button, EmptyState, Modal, Skeleton } from "@speakkit/ui";
import type { ModelCard, SpeechModelsView } from "../../../shared/speech-models/contract";
import { models } from "./api";
import { CompareDialog } from "./CompareDialog";
import { ImportDialog } from "./ImportDialog";
import { ModelCardView } from "./ModelCards";
import { Performance } from "./Performance";
import { DiskSpace } from "./Tables";
import { deleteConfirm, recommendationText, sampleText, sortedModels } from "../../speech-text";
import type { Run } from "./run";
import { useSpeechModels } from "./useSpeechModels";
import "./speech-models.css";

/** Runs one action against the bridge; the page then follows the view the main process pushes. */
function useRunner(set: (v: SpeechModelsView) => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = (f: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    f()
      .then((r) => {
        if (r && typeof r === "object") {
          const o = r as { models?: unknown; ok?: boolean; message?: string };
          if (Array.isArray(o.models)) set(r as SpeechModelsView);
          else if (o.ok === false && o.message) setMessage(o.message);
        }
      })
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, "") : String(e)))
      .finally(() => setBusy(false));
  };
  return { busy, message, run, clear: () => setMessage(null) };
}

function Notices({ v, run }: { v: SpeechModelsView; run: (f: () => Promise<unknown>) => void }) {
  const rec = recommendationText(v);
  return (
    <>
      {!v.dictationSupported && (
        <Banner tone="info" title="Dictation is not available on this computer yet">
          You can still manage speech models here.
        </Banner>
      )}
      {v.floor && (
        <Banner tone="warning" title="This computer is limited" role="status">
          {v.floor.message}
        </Banner>
      )}
      {v.newer && (
        <Banner tone="info" icon="sparkles" title={`${v.newer.name} is out`} action={<Button onClick={() => run(() => models.dismissNewer(v.newer!.id))}>Dismiss</Button>}>
          It replaces a model you have. Speak Kit never switches or downloads by itself.
        </Banner>
      )}
      {rec && !v.floor && (
        <Banner tone="info" icon="sparkles" title={rec.title} action={<Button onClick={() => run(() => models.download(rec.model))}>Get {v.names[rec.model]}</Button>}>
          {rec.body}
        </Banner>
      )}
    </>
  );
}

function Loading({ failed, retry }: { failed: boolean; retry(): void }) {
  return (
    <section className="sk-engines-section" aria-label="Speech models">
      <h2>Speech models</h2>
      {failed ? (
        <Banner tone="error" title="Speech models could not be listed" action={<Button onClick={retry}>Try again</Button>}>
          Speak Kit could not read its list of models. Nothing was changed.
        </Banner>
      ) : (
        <div className="sk-model-grid" aria-busy="true">
          <Skeleton lines={[240, 180, 220, 160]} />
          <Skeleton lines={[240, 180, 220, 160]} />
        </div>
      )}
    </section>
  );
}

/** What is going on right now: an action that failed, a switch being checked, a recording, or no model at all. */
function Status({ v, message, clear, run }: { v: SpeechModelsView; message: string | null; clear(): void; run: Run }) {
  const empty = v.noModel && !v.models.some((m) => m.transfer);
  const first = v.recommendation?.model ?? v.models[0]!.id;
  return (
    <>
      {message && (
        <Banner tone="error" title="That did not work" action={<Button onClick={clear}>Dismiss</Button>}>
          {message}
        </Banner>
      )}
      {v.switching && (
        <Banner
          tone="info"
          role="status"
          title={`Checking ${v.names[v.switching] ?? v.switching} before switching`}
          action={<Button onClick={() => run(() => models.cancelSwitch())}>Cancel the switch</Button>}
        >
          The model in use stays in use until the new one is loaded.
        </Banner>
      )}
      {v.recording && (
        <Banner tone="info" role="status" title="Recording">
          Finish the recording first to switch models.
        </Banner>
      )}
      {empty && !v.skippedModel && (
        <EmptyState
          icon="microphone"
          title="No speech model"
          primary={{ label: "Download a model", onClick: () => run(() => models.download(first)) }}
          secondary={{ label: "Not now", onClick: () => run(() => models.continueWithoutModel()) }}
        >
          Dictation stays off. Reading aloud and voice chat keep working.
        </EmptyState>
      )}
      {empty && v.skippedModel && (
        <Banner tone="warning" title="Dictation is off until a model is downloaded">
          Pick a model below when you want to dictate.
        </Banner>
      )}
    </>
  );
}

function DeleteDialog({ card, v, onClose, run }: { card: ModelCard | null; v: SpeechModelsView; onClose(): void; run: Run }) {
  const confirm = card ? deleteConfirm(card, v) : null;
  const remove = () => {
    const id = card!.id;
    onClose();
    run(() => models.remove(id).then(() => models.view()));
  };
  const footer = (
    <>
      <Button data-autofocus onClick={onClose}>
        Cancel
      </Button>
      <Button variant="danger" onClick={remove}>
        Delete
      </Button>
    </>
  );
  return (
    <Modal open={card !== null} onClose={onClose} title={confirm?.title ?? ""} width={440} footer={footer}>
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {confirm?.body}
      </p>
    </Modal>
  );
}

function ModelGrid({ v, shown, run, busy, onDelete }: { v: SpeechModelsView; shown: ModelCard[]; run: Run; busy: boolean; onDelete(c: ModelCard): void }) {
  const advice = (a: string) => run(() => (a === "open-proxy-settings" ? models.openProxySettings() : models.openModelsFolder()));
  return (
    <div className="sk-model-grid">
      {shown.map((c) => (
        <ModelCardView
          key={c.id}
          card={c}
          language={v.dictationLanguage}
          busy={busy || !!v.switching}
          run={run}
          onDelete={onDelete}
          onUse={(x) => run(() => models.use(x.id))}
          onFailureAdvice={advice}
        />
      ))}
    </div>
  );
}

function ModelsSection({ v, run, state }: { v: SpeechModelsView; run: Run; state: { busy: boolean; message: string | null; clear(): void; setDeleting(c: ModelCard): void; setImporting(): void } }) {
  const [comparing, setComparing] = useState(false);
  const shown = sortedModels(v.models);
  return (
    <section className="sk-engines-section" aria-labelledby="models-h">
      <div className="sk-engines-section__head">
        <h2 id="models-h">Speech models</h2>
      </div>
      <Notices v={v} run={run} />
      <Status v={v} message={state.message} clear={state.clear} run={run} />
      <ModelGrid v={v} shown={shown} run={run} busy={state.busy} onDelete={state.setDeleting} />
      <p className="sk-engines-section__foot">{sampleText(v.sample)}</p>
      <div className="sk-engines-section__actions">
        {shown.length > 1 && (
          <Button iconLeft="arrows-horizontal" onClick={() => setComparing(true)}>
            Compare models
          </Button>
        )}
        <Button iconLeft="upload" onClick={state.setImporting}>
          Import a model file
        </Button>
      </div>
      <CompareDialog open={comparing} v={v} cards={shown} onClose={() => setComparing(false)} />
    </section>
  );
}

/** Speech models: the model cards, performance and disk space. */
export function SpeechModelsSection() {
  const { view: v, failed, set } = useSpeechModels();
  const { busy, message, run, clear } = useRunner(set);
  const [deleting, setDeleting] = useState<ModelCard | null>(null);
  const [importing, setImporting] = useState(false);
  if (!v) return <Loading failed={failed} retry={() => run(() => models.view().then(set))} />;
  return (
    <>
      <ModelsSection v={v} run={run} state={{ busy, message, clear, setDeleting, setImporting: () => setImporting(true) }} />
      <Performance v={v} run={run} />
      <DiskSpace v={v} run={run} onDelete={setDeleting} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} run={run} />
      <DeleteDialog card={deleting} v={v} onClose={() => setDeleting(null)} run={run} />
    </>
  );
}
