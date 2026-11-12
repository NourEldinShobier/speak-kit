import { Icon } from "@speakkit/ui";
import { capsuleView, type CapsuleState } from "../../../shared/capture/capsule";
import type { CapsuleAction } from "../../../shared/capture/contract";
import "./capsule.css";

interface Props {
  state: CapsuleState;
  onAction?(a: CapsuleAction): void;
  onHover?(over: boolean): void;
}

/** The capsule: the target chip, the line of what is happening, the timer, and the buttons of this state. The window and the playground draw the same component. */
export function CapsulePill({ state, onAction, onHover }: Props) {
  const v = capsuleView(state);
  return (
    <div className="cap-pill" data-tone={v.tone} role="group" aria-label="Capture" onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}>
      <span className="cap-pill__chip" title="Drag to move">
        {v.live ? <span className="cap-pill__dot" aria-hidden="true" /> : <Icon name="scan" size={14} />}
        <span className="cap-pill__name">{v.chip}</span>
      </span>
      <span className="cap-pill__text" role="status">
        <span>{v.text}</span>
        {v.detail ? <small>{v.detail}</small> : null}
        {v.steps ? (
          <span className="cap-pill__steps">
            {v.steps.map((s) => (
              <span key={s.label} data-state={s.state}>
                {s.state === "done" ? <Icon name="check" size={12} /> : null}
                {s.label}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      {v.timer ? <span className="cap-pill__timer">{v.timer}</span> : null}
      {v.buttons.map((b) => (
        <button
          key={b.id}
          type="button"
          className="cap-pill__btn"
          data-primary={b.primary || undefined}
          aria-pressed={b.pressed}
          disabled={b.disabled}
          onClick={() => onAction?.(b.id as CapsuleAction)}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
