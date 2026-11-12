import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon } from "@speakkit/ui";
import type { CapsuleAction, CapsuleView } from "../../../shared/meetings/contract";
import { timerText } from "./model";
import "./capsule.css";

interface Props {
  view: CapsuleView;
  onAction(a: CapsuleAction): void;
  onHover(over: boolean): void;
  onDrag(dx: number, dy: number, end: boolean): void;
}

function Button({ children, onClick, primary, label }: { children: ReactNode; onClick(): void; primary?: boolean; label?: string }) {
  return (
    <button type="button" className="mc-btn" data-primary={primary || undefined} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function Close({ onClick, label = "Close" }: { onClick(): void; label?: string }) {
  return (
    <button type="button" className="mc-close" aria-label={label} onClick={onClick}>
      <Icon name="x" size={14} />
    </button>
  );
}

function Level({ you, them }: { you: number; them: number }) {
  return (
    <span className="mc-levels" aria-hidden="true">
      <span className="mc-level" data-track="you" style={{ inlineSize: `${Math.round(Math.min(1, you) * 100)}%` }} />
      <span className="mc-level" data-track="them" style={{ inlineSize: `${Math.round(Math.min(1, them) * 100)}%` }} />
    </span>
  );
}

function Mark({ text }: { text: string }) {
  return (
    <span className="mc-mark" aria-hidden="true">
      {text}
    </span>
  );
}

/** "Not now" opens a short list: skip this call only, or never offer for this app (which opens Settings). Closing it without a choice keeps the offer. */
function Offer({ view, onAction }: { view: Extract<CapsuleView, { kind: "offer" }>; onAction(a: CapsuleAction): void }) {
  const [menu, setMenu] = useState(false);
  const dismiss = (how: "close" | "this-call" | "never") => onAction({ type: "dismiss", sessionId: view.sessionId, how });
  return (
    <>
      <div className="mc-pill" role="group" aria-label="Record this call?">
        <Mark text={view.mark} />
        <span className="mc-text" role="status">
          <b>{view.app} call started</b>
          <small>Record it?</small>
        </span>
        <Button primary onClick={() => onAction({ type: "record", sessionId: view.sessionId })}>
          Record
        </Button>
        <Button onClick={() => setMenu((m) => !m)} label="Not now">
          Not now
        </Button>
        <Close onClick={() => dismiss("close")} label="Close this offer" />
      </div>
      {menu ? (
        <div className="mc-menu" role="menu" aria-label="Not now">
          <button type="button" role="menuitem" className="mc-item" onClick={() => dismiss("this-call")}>
            Not for this call
            <small>Ask again on the next call.</small>
          </button>
          <button type="button" role="menuitem" className="mc-item" onClick={() => dismiss("never")}>
            Never offer for {view.app}
            <small>Opens Meetings settings.</small>
          </button>
        </div>
      ) : null}
    </>
  );
}

function Recording({ view, onAction }: { view: Extract<CapsuleView, { kind: "recording" }>; onAction(a: CapsuleAction): void }) {
  const warn = view.micSilent ? "Your microphone is silent. Check that it is not muted." : view.note;
  return (
    <div className="mc-pill" role="group" aria-label="Recording a meeting" data-note={warn ? "" : undefined} title={`${view.app}. Drag to move.`}>
      <span className="mc-grip" aria-hidden="true" />
      <span className="mc-dot" aria-hidden="true" />
      <span className="mc-timer" role="timer" aria-label={`Recording ${view.app}, ${timerText(view.seconds)}`}>
        {timerText(view.seconds)}
      </span>
      <Level you={view.you} them={view.them} />
      {warn ? (
        <span className="mc-text" role="status">
          <small>{warn}</small>
        </span>
      ) : null}
      <Button primary onClick={() => onAction({ type: "stop" })} label="Stop and save">
        Stop
      </Button>
    </div>
  );
}

function Ending({ view, onAction }: { view: Extract<CapsuleView, { kind: "ending" }>; onAction(a: CapsuleAction): void }) {
  const counting = view.secondsLeft !== null;
  return (
    <div className="mc-pill" role="group" aria-label="The call ended">
      <span className="mc-dot" aria-hidden="true" />
      <span className="mc-text" role="status">
        <b>The call ended</b>
        <small>{counting ? `Saving in ${view.secondsLeft} s` : "Stop recording?"}</small>
      </span>
      <Button onClick={() => onAction({ type: "keep" })}>Keep recording</Button>
      <Button primary onClick={() => onAction({ type: "stop" })}>
        {counting ? "Stop now" : "Stop and save"}
      </Button>
      <Close onClick={() => onAction({ type: "keep" })} label="Keep recording and close" />
    </div>
  );
}

function Saved({ view, onAction }: { view: Extract<CapsuleView, { kind: "saved" }>; onAction(a: CapsuleAction): void }) {
  return (
    <div className="mc-pill" role="group" aria-label="Transcript ready">
      <Mark text={view.mark} />
      <span className="mc-text" role="status">
        <b>Transcript ready</b>
        <small className="mc-title">{view.title}</small>
      </span>
      <Button primary onClick={() => onAction({ type: "open", id: view.id })}>
        Open
      </Button>
      <Button onClick={() => onAction({ type: "show-folder", id: view.id })}>Show in folder</Button>
      <Close onClick={() => onAction({ type: "close" })} />
    </div>
  );
}

function Notice({ view, onAction }: { view: Extract<CapsuleView, { kind: "notice" }>; onAction(a: CapsuleAction): void }) {
  return (
    <div className="mc-pill" role="alert" data-tone="error">
      <span className="mc-text">
        <b>{view.text}</b>
      </span>
      <Close onClick={() => onAction({ type: "close" })} />
    </div>
  );
}

function Body({ view, onAction }: { view: CapsuleView; onAction(a: CapsuleAction): void }) {
  if (view.kind === "offer") return <Offer view={view} onAction={onAction} />;
  if (view.kind === "recording") return <Recording view={view} onAction={onAction} />;
  if (view.kind === "ending") return <Ending view={view} onAction={onAction} />;
  if (view.kind === "saved") return <Saved view={view} onAction={onAction} />;
  return <Notice view={view} onAction={onAction} />;
}

/**
 * The capsule: one pill at a time. Drag it anywhere by its background (buttons keep their clicks); the window passes clicks through everywhere else, so the
 * pill is told when the pointer is on it. The window and the design share this component.
 */
export function MeetingCapsule({ view, onAction, onHover, onDrag }: Props) {
  const last = useRef<{ x: number; y: number } | null>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    last.current = { x: e.screenX, y: e.screenY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const from = last.current;
    if (!from) return;
    onDrag(e.screenX - from.x, e.screenY - from.y, false);
    last.current = { x: e.screenX, y: e.screenY };
  };
  const up = () => {
    if (last.current) onDrag(0, 0, true);
    last.current = null;
  };
  return (
    <div className="mc-wrap" onMouseEnter={() => onHover(true)} onMouseLeave={() => !last.current && onHover(false)} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <Body view={view} onAction={onAction} />
    </div>
  );
}
