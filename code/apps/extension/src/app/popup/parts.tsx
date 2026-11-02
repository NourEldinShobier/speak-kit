import type { ReactNode } from "react";
import type { EngineState } from "@speakkit/protocol";
import { EmptyState, Icon, IconButton, Logo, StatusPill, type IconName } from "@speakkit/ui";
import { headerBadge, type PopupView } from "../../features/connection";

const TONE = { ok: "green", warn: "orange", err: "red", neutral: "neutral" } as const;

export const Header = ({ view, engine, onOptions }: { view: PopupView; engine?: EngineState | undefined; onOptions: () => void }) => {
  const b = headerBadge(view, engine);
  return (
    <header className="pp-head">
      <div className="pp-brand">
        <Logo size={24} />
        <span>Speak Kit</span>
      </div>
      <StatusPill tone={TONE[b.tone]}>{b.label}</StatusPill>
      <IconButton name="adjustments" label="Open settings" onClick={onOptions} />
    </header>
  );
};

export const Foot = ({ left = "Runs on this computer", right = "Open app", onRight }: { left?: string | undefined; right?: string; onRight: () => void }) => (
  <footer className="pp-foot">
    <span className="pp-foot-l">
      <Icon name="lock" size={13} />
      {left}
    </span>
    <button type="button" className="sk-link" onClick={onRight}>
      {right}
      <Icon name="external-link" size={13} />
    </button>
  </footer>
);

export interface MsgProps {
  icon: IconName;
  title: string;
  body: string;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void } | undefined;
  note?: ReactNode;
}

export const Msg = ({ icon, title, body, primary, secondary, note }: MsgProps) => (
  <section role="alert">
    <EmptyState icon={icon} title={title} primary={primary} secondary={secondary}>
      {body}
    </EmptyState>
    {note}
  </section>
);

export const NowCard = ({ title, sub }: { title: string; sub: string }) => (
  <section className="pp-now">
    <span className="pp-now__ic">
      <Icon name="world" size={18} />
    </span>
    <div className="pp-now__t">
      <div className="pp-title" dir="auto">
        {title}
      </div>
      <div className="pp-sub">{sub}</div>
    </div>
  </section>
);
