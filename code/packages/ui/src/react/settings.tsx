import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import type { IconName } from "../icons";
import { Button } from "./controls";
import { Favicon } from "./display";
import { cx, Icon } from "./shared";

export interface SettingRowProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  description?: ReactNode;
  /** Control on the right: Toggle, Select, Segmented, IconButton. */
  control?: ReactNode;
}

/** Row of a settings card: pad 11/14, label 13/500, description 12 tertiary, control right. */
export function SettingRow({ label, description, control, className, ...rest }: SettingRowProps) {
  return (
    <div className={cx("lm-row", className)} {...rest}>
      <div className="lm-row__text">
        <div className="lm-row__label">{label}</div>
        {description ? <div className="lm-row__desc">{description}</div> : null}
      </div>
      {control ? <div className="lm-row__control">{control}</div> : null}
    </div>
  );
}

export interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Title + description, then a r12 card whose SettingRow children are separated by 1px dividers. */
export function SettingsSection({ title, description, children, className }: SettingsSectionProps) {
  return (
    <section className={cx("lm-section", className)}>
      <header className="lm-section__head">
        <h3 className="lm-section__title">{title}</h3>
        {description ? <p className="lm-section__desc">{description}</p> : null}
      </header>
      <div className="lm-card">{children}</div>
    </section>
  );
}

export interface ListRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  icon?: IconName;
  title: ReactNode;
  preview?: ReactNode;
  meta?: ReactNode;
}

/** Thread-style list row: 16px icon, title 14/500, preview 12, date right, top divider. */
export function ListRow({ icon, title, preview, meta, className, ...rest }: ListRowProps) {
  return (
    <button type="button" className={cx("lm-listrow", className)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      <span className="lm-listrow__text">
        <span className="lm-listrow__title">{title}</span>
        {preview ? <span className="lm-listrow__sub">{preview}</span> : null}
      </span>
      {meta ? <span className="lm-listrow__meta">{meta}</span> : null}
    </button>
  );
}

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  children?: ReactNode;
  primary?: { label: string; onClick?: () => void };
  secondary?: { label: string; onClick?: () => void };
  className?: string;
}

export function EmptyState({ icon, title, children, primary, secondary, className }: EmptyStateProps) {
  return (
    <div className={cx("lm-empty", className)}>
      <div className="lm-empty__tile">
        <Icon name={icon} size={26} />
      </div>
      <h3 className="lm-empty__title">{title}</h3>
      {children ? <p className="lm-empty__body">{children}</p> : null}
      {primary || secondary ? (
        <div className="lm-empty__actions">
          {primary ? (
            <Button variant="primary" onClick={primary.onClick}>
              {primary.label}
            </Button>
          ) : null}
          {secondary ? <Button onClick={secondary.onClick}>{secondary.label}</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

export interface SourceCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  domain: string;
  index?: number;
  cited?: boolean;
  excluded?: boolean;
}

export function SourceCard({ title, domain, index, cited, excluded, className, ...rest }: SourceCardProps) {
  return (
    <div className={cx("lm-source", cited && "is-cited", excluded && "is-excluded", className)} {...rest}>
      <div className="lm-source__title">{title}</div>
      <div className="lm-source__meta">
        <Favicon name={domain.slice(0, 1).toUpperCase()} />
        <span>{domain}</span>
        <span className="lm-spacer" />
        {index !== undefined ? <span>{index}</span> : null}
      </div>
    </div>
  );
}

export interface ComposerProps {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  streaming?: boolean;
  disabled?: boolean;
  onSend?: () => void;
  onStop?: () => void;
  className?: string;
  frameClassName?: string;
}

/** 420x52 pill: plus, input, mic, send (accent while focused/typing, stop while streaming). */
export function Composer({
  value,
  onChange,
  placeholder = "Ask a follow-up",
  streaming,
  disabled,
  onSend,
  onStop,
  className,
}: ComposerProps) {
  return (
    <div className={cx("lm-composer", disabled && "is-disabled", className)}>
      <button type="button" className="lm-btn lm-btn--icon lm-btn--round" aria-label="Add" disabled={disabled}>
        <Icon name="plus" />
      </button>
      <input
        className="lm-composer__field"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={placeholder}
        onChange={(e) => onChange?.(e.currentTarget.value)}
      />
      <button type="button" className="lm-btn lm-btn--icon lm-btn--round" aria-label="Dictate" disabled={disabled}>
        <Icon name="microphone" />
      </button>
      <button
        type="button"
        className={cx("lm-btn lm-btn--icon lm-btn--round lm-btn--send", streaming && "is-stop")}
        aria-label={streaming ? "Stop" : "Send"}
        disabled={disabled}
        onClick={streaming ? onStop : onSend}
      >
        <Icon name={streaming ? "player-stop" : "arrow-narrow-up"} />
      </button>
    </div>
  );
}
