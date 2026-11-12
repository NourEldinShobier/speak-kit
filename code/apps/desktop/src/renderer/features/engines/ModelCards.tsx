import { Badge, Button, Icon, ProgressBar } from "@speakkit/ui";
import type { ModelCard } from "../../../shared/speech-models/contract";
import { models } from "./api";
import { accuracyText, FAILURE_BUTTONS, failureText, languagesText, memoryText, recommendedText, sizeText, speedText, transferText } from "./speech-text";

const TAGLINES: Record<string, string> = { Accurate: "The accurate one", Fast: "The fast one", Yours: "Added by you" };
export const tagline = (c: ModelCard): string => TAGLINES[c.tag] ?? c.tag;

interface Props {
  card: ModelCard;
  busy: boolean;
  /** Runs a model action and shows what it answered. */
  run(f: () => Promise<unknown>): void;
  onDelete(c: ModelCard): void;
  onUse(c: ModelCard): void;
  /** Where the failure buttons that are not retries go. */
  onFailureAdvice(advice: string, c: ModelCard): void;
}

function Facts({ c }: { c: ModelCard }) {
  const rows: [string, string][] = [
    ["Accuracy", accuracyText(c)],
    ["Speed", speedText(c)],
    ["Languages", languagesText(c.languages)],
    ["File size", sizeText(c.bytes)],
  ];
  return (
    <dl className="sk-model__facts">
      {rows.map(([k, val]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{val}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Licence and memory: kept out of the main card. Memory only with the setup it was measured in, never a guess. */
function Details({ c, run }: { c: ModelCard; run: Props["run"] }) {
  return (
    <details className="sk-model__details">
      <summary>Details</summary>
      <dl className="sk-model__facts">
        <div>
          <dt>Licence</dt>
          <dd>{c.license.url ? <a href={c.license.url} target="_blank" rel="noreferrer">{c.license.name}</a> : c.license.name}</dd>
        </div>
        {c.accuracy && (
          <div>
            <dt>Accuracy source</dt>
            <dd>{c.accuracy.source}</dd>
          </div>
        )}
        <div>
          <dt>Memory while running</dt>
          <dd>
            {memoryText(c)}
            {c.installed && !c.memory && (
              <Button className="sk-model__measure" onClick={() => run(() => models.measureMemory())}>
                Measure
              </Button>
            )}
          </dd>
        </div>
      </dl>
    </details>
  );
}

function Footer({ card: c, busy, run, onDelete, onUse, onFailureAdvice }: Props) {
  if (c.fileMissing)
    return (
      <div className="sk-model__foot">
        <p className="sk-model__note" role="alert">
          The file of this model is missing from Speak Kit's folder. The file is fine if you still have it: find it again.
        </p>
        <div className="sk-model__actions">
          <Button disabled={busy} onClick={() => run(() => models.locateFile(c.id))}>
            Find the file
          </Button>
          <Button disabled={busy} onClick={() => run(() => models.removeImported(c.id))}>
            Remove
          </Button>
        </div>
      </div>
    );
  if (c.transfer) {
    const t = c.transfer;
    return (
      <div className="sk-model__foot">
        <ProgressBar thin block value={t.state === "preparing" ? undefined : Math.round(t.fraction * 100)} label={`${c.name} download`} />
        <p className="sk-model__note" aria-live="polite">
          {transferText(c)}
        </p>
        {t.state !== "preparing" && (
          <div className="sk-model__actions">
            {t.state === "running" ? <Button onClick={() => run(() => models.pauseDownload(c.id))}>Pause</Button> : <Button variant="primary" onClick={() => run(() => models.resumeDownload(c.id))}>Resume</Button>}
            <Button onClick={() => run(() => models.cancelDownload(c.id))}>Cancel</Button>
          </div>
        )}
      </div>
    );
  }
  if (c.installed)
    return (
      <div className="sk-model__foot">
        {c.languageNote && <p className="sk-model__note">{c.languageNote}</p>}
        <div className="sk-model__actions sk-model__actions--between">
          <span className="sk-model__installed">
            <Icon name="check" size={14} /> Installed
          </span>
          <span className="sk-model__actions">
            {!c.inUse && (
              <Button disabled={busy} onClick={() => onUse(c)}>
                Use this model
              </Button>
            )}
            <Button aria-label={`Delete ${c.name}`} disabled={busy} variant="danger" onClick={() => onDelete(c)}>
              Delete
            </Button>
          </span>
        </div>
      </div>
    );
  return (
    <div className="sk-model__foot">
      {c.failure && (
        <div className="sk-model__failure" role="alert">
          <p>{failureText(c)}</p>
          <div className="sk-model__actions">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => (c.failure!.advice === "try-again" || c.failure!.advice === "download-again" ? run(() => models.download(c.id)) : onFailureAdvice(c.failure!.advice, c))}
            >
              {FAILURE_BUTTONS[c.failure.advice] ?? "Try again"}
            </Button>
            {(c.failure.advice === "open-proxy-settings" || c.failure.advice === "free-space") && (
              <Button disabled={busy} onClick={() => run(() => models.download(c.id))}>
                Try again
              </Button>
            )}
          </div>
        </div>
      )}
      {c.blocked ? (
        <p className="sk-model__note">{c.blocked}</p>
      ) : (
        !c.failure && (
          <Button className="sk-model__wide" disabled={busy} onClick={() => run(() => models.download(c.id))}>
            Download {sizeText(c.bytes)}
          </Button>
        )
      )}
    </div>
  );
}

/** One model: its name, what it is for, the four facts that matter, and the one button that fits its state. */
export function ModelCardView(props: Props) {
  const c = props.card;
  const rec = recommendedText(c);
  return (
    <article className={`sk-model${c.inUse ? " is-inuse" : ""}${c.blocked ? " is-blocked" : ""}`} data-testid={`model-card-${c.id}`} data-model={c.id} aria-label={c.name}>
      <header className="sk-model__head">
        <div>
          <h3>{c.name}</h3>
          <p>{tagline(c)}</p>
        </div>
        {c.inUse && <Badge>In use</Badge>}
      </header>
      {rec && (
        <p className="sk-model__rec">
          <Badge>Recommended</Badge> <span>{rec}</span>
        </p>
      )}
      <Facts c={c} />
      <Details c={c} run={props.run} />
      <Footer {...props} />
    </article>
  );
}
