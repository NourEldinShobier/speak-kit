import { useState } from "react";
import { Badge, Banner, Button, EmptyState, Modal } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import "../../../shared/settings/builtin-experiments";
import { experiments, groupExperiments, needsRestart, toggled, visibleExperiments, type Experiment } from "../../../shared/settings/experiments";
import { api, Page } from "../../ui";
import { ExperimentCards, experimentCards } from "../experiments";
import { arrowTarget, rowAttr } from "./focus";

function Card({ e, on, onToggle }: { e: Experiment; on: boolean; onToggle(): void }) {
  return (
    <article className="sk-exp" data-testid={`experiment-${e.id}`} aria-label={e.title}>
      <div className="sk-exp__head">
        <b>{e.title}</b>
        <Badge>Experimental</Badge>
        {on && <Badge>On</Badge>}
      </div>
      <p>{e.summary}</p>
      <p className="sk-exp__warn">{e.warning}</p>
      <p className="sk-exp__grad">{e.graduation}</p>
      <Button onClick={onToggle}>{on ? "Turn off" : "Turn on"}</Button>
    </article>
  );
}

function RestartBanner() {
  return (
    <Banner
      tone="info"
      title="Restart needed"
      action={
        <Button variant="primary" onClick={() => api.restartApp()}>
          Restart now
        </Button>
      }
    >
      A change you made takes effect after Speak Kit restarts.
    </Banner>
  );
}

function ConfirmOn({ e, onCancel, onConfirm }: { e: Experiment | null; onCancel(): void; onConfirm(e: Experiment): void }) {
  return (
    <Modal
      open={e !== null}
      onClose={onCancel}
      title={e ? `Turn on ${e.title}?` : ""}
      width={440}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => e && onConfirm(e)}>
            Turn on
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {e?.warning}
      </p>
    </Modal>
  );
}

/** Arrow keys, Home and End move between the cards' buttons; Tab still reaches each one. */
function moveBetweenCards(e: React.KeyboardEvent<HTMLElement>) {
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(".sk-exp button")];
  const to = arrowTarget(e.key, buttons.indexOf(e.target as HTMLButtonElement), buttons.length);
  if (to === null) return;
  e.preventDefault();
  buttons[to]?.focus();
}

export function ExperimentsPage({ s }: { s: AppState }) {
  const [confirm, setConfirm] = useState<Experiment | null>(null);
  const [restart, setRestart] = useState(false);
  const flags = s.config.experiments;
  const list = visibleExperiments(!s.packaged);
  const set = async (e: Experiment, on: boolean) => {
    const next = toggled(flags, e.id, on);
    if (needsRestart(flags, next, experiments())) setRestart(true);
    await api.patchConfig({ experiments: next });
  };
  return (
    <Page title="Experiments" lead="Early features that may change or disappear. Each one is off until you turn it on.">
      {restart && <RestartBanner />}
      <div {...rowAttr("experiments/list")} className="sk-exps" onKeyDown={moveBetweenCards}>
        {list.length === 0 && experimentCards().length === 0 && (
          <EmptyState icon="flask" title="No experiments right now">
            New early features show up here when a version has them.
          </EmptyState>
        )}
        {groupExperiments(list).map((g) => (
          <section key={g.group} aria-label={g.group}>
            <h3 className="sk-exps__group">{g.group}</h3>
            {g.items.map((e) => (
              <Card key={e.id} e={e} on={flags[e.id] === true} onToggle={() => (flags[e.id] === true ? void set(e, false) : setConfirm(e))} />
            ))}
          </section>
        ))}
      </div>
      <ExperimentCards />
      <p className="sk-note">Experiments are not covered by support. If one causes trouble, turn it off.</p>
      <ConfirmOn
        e={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={(e) => {
          void set(e, true);
          setConfirm(null);
        }}
      />
    </Page>
  );
}
