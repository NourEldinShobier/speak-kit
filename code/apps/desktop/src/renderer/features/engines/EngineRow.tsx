import { Button, Icon, ProgressBar, StatusPill } from "@speakkit/ui";
import type { EngineInfo } from "@speakkit/protocol";
import { describeEngine, type EngineAction } from "../../../shared/engines";
import { ACTION_LABELS, ENGINE_BLURBS } from "./model";
import "./engines.css";

const VARIANTS: Partial<Record<EngineAction, "primary">> = { retry: "primary" };
const variant = (a: EngineAction) => VARIANTS[a] ?? "secondary";

interface RowProps {
  engine: EngineInfo;
  busy: string | null;
  onAction(a: EngineAction): void;
}

export function EngineRow({ engine: e, busy, onAction }: RowProps) {
  const d = describeEngine(e);
  return (
    <div className="sk-engine" data-engine={e.id} data-state={e.state}>
      <span className="sk-tile">
        <Icon name="cpu" size={18} />
      </span>
      <div className="sk-engine__body">
        <div className="sk-engine__head">
          <b>{e.name}</b>
          <StatusPill tone={d.pill.tone} icon={d.pill.spinner ? "loader-2" : undefined}>
            {d.pill.label}
          </StatusPill>
        </div>
        <span>{ENGINE_BLURBS[e.id]}</span>
        {d.note && <span data-testid={`engine-note-${e.id}`}>{d.note}</span>}
        {d.progress !== null && <ProgressBar thin value={Math.round(d.progress * 100)} label={`${e.name} progress`} />}
        {d.actions.length > 0 && (
          <div className="sk-row-actions">
            {d.actions.map((a) => (
              <Button key={a} variant={variant(a)} loading={busy === `${e.id}:${a}`} onClick={() => onAction(a)}>
                {ACTION_LABELS[a]}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
