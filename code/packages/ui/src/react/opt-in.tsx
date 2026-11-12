import type { ReactNode } from "react";
import type { IconName } from "../icons";
import { Button } from "./controls";
import { cx, Icon } from "./shared";

export interface OptInCardProps {
  icon: IconName;
  title: string;
  children: ReactNode;
  /** The button label; default "Turn on". */
  enableLabel?: string;
  onEnable(): void;
  className?: string;
}

/** What a feature that is off shows in place of its settings: what it does, and one button that turns it on. */
export function OptInCard({ icon, title, children, enableLabel = "Turn on", onEnable, className }: OptInCardProps) {
  return (
    <section className={cx("lm-optin", className)} aria-label={title}>
      <span className="lm-optin__tile">
        <Icon name={icon} size={20} />
      </span>
      <div className="lm-optin__text">
        <h3 className="lm-optin__title">{title}</h3>
        <p className="lm-optin__body">{children}</p>
      </div>
      <Button variant="primary" onClick={onEnable}>
        {enableLabel}
      </Button>
    </section>
  );
}
