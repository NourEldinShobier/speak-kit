import { useEffect, useState, type ReactNode } from "react";
import { Icon, Spinner, type IconName } from "@speakkit/ui";
import type { HudView } from "../../../shared/dictation/contract";
import { dictation } from "./api";
import "./hud.css";

// Heights of the level bars at full volume; each bar follows the microphone level but never collapses entirely.
const BARS = [6, 12, 20, 14, 8, 18, 10, 5];

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 250);
    return () => clearTimeout(t);
  }, [now]);
  return <span className="hud__time">{clock(now - since)}</span>;
}

const Bars = ({ level }: { level: number }) => (
  <span className="hud__bars" aria-hidden="true">
    {BARS.map((h, i) => (
      <i key={i} style={{ blockSize: `${Math.max(3, Math.round(h * (0.25 + 0.75 * level)))}px` }} />
    ))}
  </span>
);

const Lead = ({ name, tone }: { name: IconName; tone?: "error" }) => <Icon name={name} size={14} className={tone ? "hud__icon hud__icon--error" : "hud__icon"} />;
const Hint = ({ children }: { children: ReactNode }) => <span className="hud__hint">{children}</span>;

function Recording({ view }: { view: Extract<HudView, { kind: "recording" }> }) {
  return (
    <>
      {view.locked ? <Lead name="lock" /> : <i className="hud__dot" />}
      <Bars level={view.level} />
      <Elapsed since={view.startedAt} />
      <Hint>{view.locked ? "Press the hotkey to stop" : "Release to finish"}</Hint>
    </>
  );
}

function Copied({ reason }: { reason: "clipboard" | "elevated" }) {
  if (reason === "elevated")
    return (
      <>
        <Lead name="shield-check" tone="error" />
        <b>Copied, this app needs admin rights to paste</b>
      </>
    );
  return (
    <>
      <Lead name="copy" />
      <b>Copied</b>
      <Hint>Press Ctrl V to paste</Hint>
    </>
  );
}

function Failure({ view }: { view: Extract<HudView, { kind: "error" }> }) {
  const action = view.action;
  return (
    <>
      <Lead name={view.icon} tone="error" />
      <b>{view.text}</b>
      {action && (
        <button type="button" className="hud__act" onClick={(e) => (e.stopPropagation(), dictation.hudAction(action.id))}>
          {action.label}
        </button>
      )}
    </>
  );
}

function Content({ view }: { view: HudView }) {
  switch (view.kind) {
    case "ready":
      return (
        <>
          <Lead name="microphone" />
          <b>Dictation ready</b>
          <Hint>{view.hotkey}</Hint>
        </>
      );
    case "recording":
      return <Recording view={view} />;
    case "transcribing":
      return (
        <>
          <Spinner size={14} />
          <b>Transcribing</b>
        </>
      );
    case "pasted":
      return (
        <>
          <Lead name="check" />
          <b>Pasted</b>
        </>
      );
    case "copied":
      return <Copied reason={view.reason} />;
    case "notice":
      return <b>{view.text}</b>;
    case "error":
      return <Failure view={view} />;
  }
}

/** One dark pill that states what dictation is doing. Only the error buttons take clicks; a click anywhere else on a failure dismisses it. */
export function Pill({ view }: { view: HudView }) {
  return (
    <div className="hud" data-kind={view.kind} role="status" onClick={() => view.kind === "error" && dictation.hudAction("dismiss")}>
      <Content view={view} />
    </div>
  );
}

/** The HUD window's page. The window cannot be activated, so the page never takes keyboard focus. */
export function HudPill() {
  const [view, setView] = useState<HudView | null>(null);
  useEffect(() => dictation.onHud(setView), []);
  return view ? <Pill view={view} /> : null;
}
