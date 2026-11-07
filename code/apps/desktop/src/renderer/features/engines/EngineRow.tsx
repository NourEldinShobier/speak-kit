import { Button, Icon, ProgressBar, StatusPill } from "@speakkit/ui";
import type { EngineInfo } from "@speakkit/protocol";
import { describeEngine, type EngineAction } from "../../../shared/engines";
import { ACTION_LABELS, ENGINE_BLURBS } from "./model";
import "./engines.css";

const VARIANTS: Partial<Record<EngineAction, "primary" | "danger">> = { install: "primary", retry: "primary", remove: "danger" };
const variant = (a: EngineAction) => VARIANTS[a] ?? "secondary";

interface RowProps {
  engine: EngineInfo;
  active: boolean;
  busy: string | null;
  onAction(a: EngineAction): void;
}

/** One engine: name and blurb, state note and bar, state pill and the buttons that fit the state. */
export function EngineRow({ engine: e, active, busy, onAction }: RowProps) {
  const d = describeEngine(e, active);
  return (
    <div className="sk-engine" data-engine={e.id} data-state={e.state}>
      <span className="sk-tile">
        <Icon name={e.id === "kokoro" ? "cpu" : "sparkles"} size={18} />
      </span>
      <div className="sk-engine__body">
        <b>
          {e.name}
          {active && <span className="sk-active"> · In use</span>}
        </b>
        <span>{ENGINE_BLURBS[e.id]}</span>
        {e.gpu && (
          <span>
            Found {e.gpu.name}, {Math.round(e.gpu.vramMb / 1024)} GB
          </span>
        )}
        {d.note && <span data-testid={`engine-note-${e.id}`}>{d.note}</span>}
        {d.details && (
          <details className="sk-engine__more" data-testid={`engine-details-${e.id}`}>
            <summary>Details</summary>
            <code>{d.details}</code>
          </details>
        )}
        {d.progress !== null && <ProgressBar thin value={Math.round(d.progress * 100)} label={`${e.name} progress`} />}
      </div>
      <div className="sk-row-actions">
        <StatusPill tone={d.pill.tone} icon={d.pill.spinner ? "loader-2" : undefined}>
          {d.pill.label}
        </StatusPill>
        {d.actions.map((a) => (
          <Button key={a} variant={variant(a)} loading={busy === `${e.id}:${a}`} onClick={() => onAction(a)}>
            {ACTION_LABELS[a]}
          </Button>
        ))}
      </div>
    </div>
  );
}
