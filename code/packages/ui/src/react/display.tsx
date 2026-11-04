import { Tooltip as RTooltip } from "radix-ui";
import { type CSSProperties, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import type { IconName } from "../icons";
import { LOGO_CLIP_ID, LOGO_COLORS, logoVariant } from "../logo";
import { Button } from "./controls";
import { cx, Icon, Spinner } from "./shared";

export type Tone = "green" | "blue" | "orange" | "red" | "purple" | "yellow";

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone | "neutral";
  icon?: IconName | undefined;
}

/** 20px status pill. Indexing uses icon="loader-2" (spins). */
export function StatusPill({ tone = "neutral", icon, className, children, ...rest }: StatusPillProps) {
  return (
    <span className={cx("lm-pill", `lm-pill--${tone}`, className)} {...rest}>
      {icon && (icon === "loader-2" ? <Spinner size={12} /> : <Icon name={icon} size={12} />)}
      {children}
    </span>
  );
}

export interface CitationProps extends Omit<HTMLAttributes<HTMLButtonElement>, "children"> {
  /** Domain / label. */
  label: string;
  /** "+1" style overflow count. */
  count?: string;
  active?: boolean;
  file?: boolean;
  removed?: boolean;
}

export function Citation({ label, count, active, file, removed, className, ...rest }: CitationProps) {
  return (
    <button type="button" aria-pressed={active ?? false} className={cx("lm-citation", file && "lm-citation--file", removed && "is-removed", className)} {...rest}>
      {label}
      {count ? <span className="lm-citation__count">{count}</span> : null}
    </button>
  );
}

export function Chip({ icon, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { icon?: IconName }) {
  return (
    <span className={cx("lm-chip", className)} {...rest}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

export function Badge({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx("lm-badge", className)} {...rest}>
      {children}
    </span>
  );
}

export function Kbd({ small, className, children, ...rest }: HTMLAttributes<HTMLElement> & { small?: boolean | undefined }) {
  return (
    <kbd className={cx("lm-kbd", small && "lm-kbd--sm", className)} {...rest}>
      {children}
    </kbd>
  );
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Initial; first character is used. */
  name: string;
  size?: number;
  /** "accent" paints the brand colour (the selected voice). */
  tone?: Tone | "neutral" | "accent";
}

export function Avatar({ name, size = 32, tone = "neutral", className, ...rest }: AvatarProps) {
  return (
    <span className={cx("lm-avatar", `lm-tone-${tone}`, className)} style={{ "--s": size } as CSSProperties} {...rest}>
      {name.slice(0, 1)}
    </span>
  );
}

export function Favicon({ name, size = 14, tone = "neutral", className, ...rest }: AvatarProps) {
  return (
    <span className={cx("lm-favicon", `lm-tone-${tone}`, className)} style={{ "--s": size } as CSSProperties} aria-hidden="true" {...rest}>
      {name.slice(0, 1)}
    </span>
  );
}

export function Skeleton({ lines = [300, 276, 180], shimmer, className }: { lines?: number[]; shimmer?: boolean; className?: string }) {
  return (
    <div className={cx("lm-skeleton", shimmer && "is-shimmer", className)} aria-hidden="true">
      {lines.map((w, i) => (
        <div key={i} className="lm-skeleton__line" style={{ width: w }} />
      ))}
    </div>
  );
}

/** Spinner + label ("Reading 14 sources"). */
export function LoadingLabel({ children }: { children: ReactNode }) {
  return (
    <span className="lm-loading" role="status">
      <Spinner />
      {children}
    </span>
  );
}

export interface ProgressBarProps {
  /** 0-100; omit for indeterminate. */
  value?: number | undefined;
  thin?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function ProgressBar({ value, thin, label, className, style }: ProgressBarProps) {
  const det = value !== undefined;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={det ? Math.round(value) : undefined}
      className={cx("lm-progress", thin && "lm-progress--thin", !det && "is-indeterminate", className)}
      style={{ "--p": det ? value : 0, ...style } as CSSProperties}
    >
      <div className="lm-progress__bar" />
    </div>
  );
}

/** SpeakKit brand mark, the Voice hub. `size` is the mark size in px. */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  const v = logoVariant(size);
  return (
    <span className={cx("lm-logo", className)} style={{ "--s": size } as CSSProperties} aria-hidden="true">
      <svg viewBox="0 0 512 512" focusable="false">
        <clipPath id={LOGO_CLIP_ID}>
          <path d={v.clip} />
        </clipPath>
        <g clipPath={`url(#${LOGO_CLIP_ID})`}>
          {v.pieces.map((p, i) => (
            <path key={i} d={p} fill={LOGO_COLORS.pieces[i]} />
          ))}
        </g>
        <path d={v.hub} fill={LOGO_COLORS.hub} />
        <path d={v.wave} fill="none" stroke={LOGO_COLORS.wave} strokeWidth={v.waveWidth} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function StreamingCaret() {
  return <span className="lm-caret" aria-hidden="true" />;
}

export type ToastTone = "neutral" | "success" | "error" | "delete";
const TOAST_ICON: Record<ToastTone, IconName> = {
  neutral: "info-circle",
  success: "circle-check",
  error: "alert-circle",
  delete: "trash",
};

export interface ToastProps {
  tone?: ToastTone;
  icon?: IconName;
  children: ReactNode;
  /** Outline action button (28px), e.g. Undo. */
  action?: { label: string; onClick?: () => void } | undefined;
  className?: string;
}

export function Toast({ tone = "neutral", icon, children, action, className }: ToastProps) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("lm-toast", className)}>
      <Icon name={icon ?? TOAST_ICON[tone]} />
      <div className="lm-toast__msg">{children}</div>
      {action ? (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export interface BannerProps {
  tone?: "info" | "warning" | "error";
  icon?: IconName;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

const BANNER_ICON = { info: "info-circle", warning: "alert-triangle", error: "alert-circle" } as const;

export function Banner({ tone = "info", icon, title, children, action, className }: BannerProps) {
  return (
    <div role={tone === "info" ? "status" : "alert"} className={cx("lm-banner", tone !== "info" && `lm-banner--${tone}`, className)}>
      <Icon name={icon ?? BANNER_ICON[tone]} />
      <div className="lm-banner__body">
        {title ? <div className="lm-banner__title">{title}</div> : null}
        <div className={title ? "lm-banner__text" : undefined}>{children}</div>
      </div>
      {action}
    </div>
  );
}

/** Static tooltip surface (also used inside <Tooltip>). */
export function TooltipSurface({ id, text, shortcut, className }: { id?: string; text: string; shortcut?: string; className?: string }) {
  return (
    <span role="tooltip" id={id} className={cx("lm-tooltip", className)}>
      {text}
      {shortcut ? <Kbd small>{shortcut}</Kbd> : null}
    </span>
  );
}

/** Radix Tooltip around a focusable child: shows on hover (after a short delay) and keyboard focus, Escape hides it. */
export function Tooltip({
  text,
  shortcut,
  children,
  side = "top",
  delayMs = 300,
}: {
  text: string;
  shortcut?: string;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  delayMs?: number;
}) {
  return (
    <RTooltip.Provider delayDuration={delayMs} skipDelayDuration={200}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Content side={side} sideOffset={6} collisionPadding={8} className="lm-tooltip lm-tooltip--floating">
          {text}
          {shortcut ? <Kbd small>{shortcut}</Kbd> : null}
        </RTooltip.Content>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}
