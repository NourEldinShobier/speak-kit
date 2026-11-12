import { Tabs as RTabs, ToggleGroup as RToggleGroup } from "radix-ui";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { IconName } from "../icons";
import { Badge } from "./display";
import { cx, Icon } from "./shared";

export interface TabItem {
  id: string;
  label: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}

/** Radix Tabs under the underline tabs (13px, 2px accent underline, gap 20). Arrow keys move and select. */
export function Tabs({ items, value, onChange, label, className }: TabsProps) {
  return (
    <RTabs.Root value={value} onValueChange={onChange} activationMode="automatic">
      <RTabs.List aria-label={label} className={cx("lm-tabs", className)}>
        {items.map((it) => (
          // The panels live in the page, not in this component, so the reference Radix adds to a missing panel is left out.
          <RTabs.Trigger key={it.id} value={it.id} className="lm-tab" aria-controls={undefined}>
            {it.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
    </RTabs.Root>
  );
}

export interface SegmentedItem {
  id: string;
  label: ReactNode;
  icon?: IconName;
  /** Accessible name when the label is an icon or abbreviated. */
  ariaLabel?: string;
}

export interface SegmentedProps {
  items: SegmentedItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  /** "pill" = composer mode switch (r999, 14px icons); "settings" = r8 container. */
  variant?: "pill" | "settings";
  className?: string;
}

/** Radix ToggleGroup (single) under the segmented control, exposed as a radiogroup; one option is always selected. */
export function Segmented({ items, value, onChange, label, variant = "settings", className }: SegmentedProps) {
  return (
    <RToggleGroup.Root
      type="single"
      role="radiogroup"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className={cx("lm-seg", variant === "pill" && "lm-seg--pill", className)}
    >
      {items.map((it) => (
        <RToggleGroup.Item key={it.id} value={it.id} aria-label={it.ariaLabel} className="lm-seg__opt">
          {it.icon ? <Icon name={it.icon} size={14} /> : null}
          {typeof it.label === "string" ? (
            <span className="lm-seg__label" data-label={it.label}>
              {it.label}
            </span>
          ) : (
            it.label
          )}
        </RToggleGroup.Item>
      ))}
    </RToggleGroup.Root>
  );
}

export function SidebarNav({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className={cx("lm-nav", className)}>
      {children}
    </nav>
  );
}

export interface NavItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: IconName;
  selected?: boolean;
  badge?: ReactNode;
}

/** 32px nav item with an 18px icon. Renders an <a>; selected sets aria-current="page". */
export function NavItem({ icon, selected, badge, className, children, ...rest }: NavItemProps) {
  return (
    <a aria-current={selected ? "page" : undefined} className={cx("lm-nav__item", className)} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      <span className="lm-nav__label">{children}</span>
      {badge !== undefined ? <Badge>{badge}</Badge> : null}
    </a>
  );
}

export function NavSection({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="lm-nav__section">
      <span>{children}</span>
      {action}
    </div>
  );
}

export interface StepperProps {
  steps: string[];
  /** 0-based index of the active step. */
  current: number;
  className?: string;
}

export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={cx("lm-stepper", className)}>
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined} style={{ display: "contents" }}>
          <span className={cx("lm-step", i === current && "is-active", i < current && "is-done")}>
            <span className="lm-step__marker">{i < current ? <Icon name="check" size={12} /> : i + 1}</span>
            {s}
          </span>
          {i < steps.length - 1 ? <span className="lm-step__line" /> : null}
        </li>
      ))}
    </ol>
  );
}
