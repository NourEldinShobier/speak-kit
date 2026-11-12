import { useState } from "react";
import { Badge, Banner, Button, Icon, Modal } from "@speakkit/ui";
import { experimentCards, groupedCards, type ExperimentCard } from "./registry";
import "./experiments.css";

function Confirm({ confirm, open, onClose, onYes }: { confirm: NonNullable<ExperimentCard["confirm"]>; open: boolean; onClose(): void; onYes(): void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={confirm.title}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" data-autofocus onClick={onYes}>
            {confirm.confirmLabel}
          </Button>
        </>
      }
    >
      {confirm.body}
    </Modal>
  );
}

function Card({ card }: { card: ExperimentCard }) {
  const st = card.useState();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const change = async (on: boolean) => {
    setFailed(false);
    try {
      await st.set(on);
    } catch {
      setFailed(true);
    }
  };
  const press = () => (st.on || !card.confirm ? void change(!st.on) : setAsking(true));
  return (
    <div className="lm-card exp-card" data-testid="experiment-card" data-id={card.id}>
      <div className="exp-card__text">
        <h3 className="exp-card__title">
          {card.title}
          {card.badges.map((b) => (
            <Badge key={b} className={`exp-badge exp-badge--${b.toLowerCase()}`}>
              {b}
            </Badge>
          ))}
        </h3>
        <p>{card.description}</p>
        {card.guard ? (
          <p className="exp-card__guard">
            <Icon name="alert-triangle" size={14} />
            {card.guard}
          </p>
        ) : null}
        {failed ? (
          <p className="exp-card__guard" role="alert">
            This could not be changed. Try again.
          </p>
        ) : null}
      </div>
      <Button aria-label={`${st.on ? "Turn off" : "Turn on"} ${card.title}`} disabled={!st.ready} onClick={press}>
        {st.on ? "Turn off" : "Turn on"}
      </Button>
      {card.confirm ? <Confirm confirm={card.confirm} open={asking} onClose={() => setAsking(false)} onYes={() => (setAsking(false), void change(true))} /> : null}
    </div>
  );
}

/** The cards features add through `registerExperiment` (capture, for one), listed by group below the page's own experiments. */
export function ExperimentCards() {
  return (
    <>
      {groupedCards(experimentCards()).map((g) => (
        <section key={g.group} aria-label={g.group} className="exp-group">
          {g.note ? (
            <Banner tone="info" role="status">
              {g.note}
            </Banner>
          ) : null}
          <h2 className="exp-group__title">{g.group}</h2>
          {g.lead ? <p className="exp-group__lead">{g.lead}</p> : null}
          {g.cards.map((c) => (
            <Card key={c.id} card={c} />
          ))}
        </section>
      ))}
    </>
  );
}
