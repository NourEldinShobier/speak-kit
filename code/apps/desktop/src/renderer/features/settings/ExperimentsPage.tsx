import { useState } from "react";
import { Badge, Banner, Button, EmptyState, Modal } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import "../../../shared/settings/builtin-experiments";
import { experiments, groupExperiments, needsRestart, toggled, visibleExperiments, type Experiment } from "../../../shared/settings/experiments";
import { api, Page } from "../../ui";
import { ExperimentCards, experimentCards } from "../experiments";
import { arrowTarget, rowAttr } from "./focus";
import { change } from "../../change";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";
import "../../../shared/i18n/packs/experiments";

function Card({ e, on, onToggle }: { e: Experiment; on: boolean; onToggle(): void }) {
  const { t, label } = useT();
  const title = label(`s.exp.${e.id}.title`, e.title);
  return (
    <article className="sk-exp" data-testid={`experiment-${e.id}`} aria-label={title}>
      <div className="sk-exp__head">
        <b>{title}</b>
        <Badge>{t("s.exp.experimental")}</Badge>
        {on && <Badge>{t("s.exp.on")}</Badge>}
      </div>
      <p>{label(`s.exp.${e.id}.summary`, e.summary)}</p>
      <p className="sk-exp__warn">{label(`s.exp.${e.id}.warning`, e.warning)}</p>
      <p className="sk-exp__grad">{label(`s.exp.${e.id}.graduation`, e.graduation)}</p>
      <Button onClick={onToggle}>{t(on ? "exp.turnOff" : "exp.turnOn")}</Button>
    </article>
  );
}

function RestartBanner() {
  const { t } = useT();
  return (
    <Banner
      tone="info"
      title={t("s.exp.restartTitle")}
      action={
        <Button variant="primary" onClick={() => api.restartApp()}>
          {t("s.exp.restartNow")}
        </Button>
      }
    >
      {t("s.exp.restartBody")}
    </Banner>
  );
}

function ConfirmOn({ e, onCancel, onConfirm }: { e: Experiment | null; onCancel(): void; onConfirm(e: Experiment): void }) {
  const { t, label } = useT();
  return (
    <Modal
      open={e !== null}
      onClose={onCancel}
      title={e ? t("s.exp.confirmTitle", { title: label(`s.exp.${e.id}.title`, e.title) }) : ""}
      width={440}
      footer={
        <>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={() => e && onConfirm(e)}>
            {t("exp.turnOn")}
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {e && label(`s.exp.${e.id}.warning`, e.warning)}
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
  const { t, label } = useT();
  const [confirm, setConfirm] = useState<Experiment | null>(null);
  const [restart, setRestart] = useState(false);
  const flags = s.config.experiments;
  const list = visibleExperiments(!s.packaged);
  const set = async (e: Experiment, on: boolean) => {
    const next = toggled(flags, e.id, on);
    if (needsRestart(flags, next, experiments())) setRestart(true);
    await change({ experiments: next });
  };
  return (
    <Page title={t("s.exp.title")} lead={t("s.exp.lead")}>
      {restart && <RestartBanner />}
      <div {...rowAttr("experiments/list")} className="sk-exps" onKeyDown={moveBetweenCards}>
        {list.length === 0 && experimentCards().length === 0 && (
          <EmptyState icon="flask" title={t("s.exp.empty")}>
            {t("s.exp.emptyHint")}
          </EmptyState>
        )}
        {groupExperiments(list).map((g) => (
          <section key={g.group} aria-label={label(`group.${g.group}`, label(`s.exp.group.${g.group}`, g.group))}>
            <h3 className="sk-exps__group">{label(`group.${g.group}`, label(`s.exp.group.${g.group}`, g.group))}</h3>
            {g.items.map((e) => (
              <Card key={e.id} e={e} on={flags[e.id] === true} onToggle={() => (flags[e.id] === true ? void set(e, false) : setConfirm(e))} />
            ))}
          </section>
        ))}
      </div>
      <ExperimentCards />
      <p className="sk-note">{t("s.exp.note")}</p>
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
