import { Slider as RSlider, Switch as RSwitch } from "radix-ui";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import type { IconName } from "../icons";
import { cx, Icon } from "./shared";

type BtnAttrs = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export interface ButtonProps extends BtnAttrs {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** md = 36, sm = 28, xs = 24, xl = 40 (dialog footers); lg is the same as md. */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  iconLeft?: IconName;
  iconRight?: IconName;
  /** Spinner replaces the leading icon (or is added when there is none); width stays. */
  loading?: boolean;
  children?: ReactNode;
}

const BTN_GLYPH: Record<string, number> = { xs: 12, sm: 14 };
const BTN_SIZE_CLASS: Record<string, string> = { xs: "lm-btn--xs", sm: "lm-btn--sm", xl: "lm-btn--xl" };
const ICON_GLYPH: Record<number, number> = { 24: 12, 28: 14 };
const ICON_SIZE_CLASS: Record<number, string> = { 24: "lm-btn--xs", 28: "lm-btn--sm", 40: "lm-btn--xl" };

export function Button({ variant = "secondary", size = "md", iconLeft, iconRight, loading, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  const lead = loading ? "loader-2" : iconLeft;
  const glyph = BTN_GLYPH[size] ?? 16;
  return (
    <button
      type={type}
      className={cx("lm-btn", `lm-btn--${variant}`, BTN_SIZE_CLASS[size], loading && "is-loading", className)}
      disabled={disabled}
      aria-busy={loading ? "true" : undefined}
      {...rest}
    >
      {lead ? <Icon name={lead} size={glyph} className={loading ? "lm-spin" : undefined} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={glyph} /> : null}
    </button>
  );
}

export interface IconButtonProps extends BtnAttrs {
  name: IconName;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  /** 36 is the default, 32 renders as 36, 28 = sm, 24 = xs, 40 = xl. */
  size?: 40 | 36 | 32 | 28 | 24;
  /** 36px circle (composer). */
  round?: boolean;
  loading?: boolean;
  /** Same variants as Button; the default has no fill (plain icon button). */
  variant?: ButtonProps["variant"];
  /** Glyph size in px when the default for the button size does not fit. */
  glyph?: number;
}

export function IconButton({ name, label, size = 36, round, loading, variant, glyph, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-busy={loading ? "true" : undefined}
      className={cx("lm-btn lm-btn--icon", variant && `lm-btn--${variant}`, ICON_SIZE_CLASS[size], round && "lm-btn--round", loading && "is-loading", className)}
      {...rest}
    >
      <Icon name={loading ? "loader-2" : name} size={glyph ?? ICON_GLYPH[size] ?? 16} className={loading ? "lm-spin" : undefined} />
    </button>
  );
}

export interface ToggleButtonProps extends BtnAttrs {
  pressed: boolean;
  iconLeft?: IconName;
  children?: ReactNode;
}

/** Same geometry as ghost; on = fill/selected, radius 8 (never a pill). */
export function ToggleButton({ pressed, iconLeft, className, children, type = "button", ...rest }: ToggleButtonProps) {
  return (
    <button type={type} aria-pressed={pressed} className={cx("lm-btn lm-btn--toggle", className)} {...rest}>
      {iconLeft ? <Icon name={iconLeft} /> : null}
      {children}
    </button>
  );
}

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  icon?: IconName;
  /** md = 36px, sm = 28px (popovers). */
  size?: "md" | "sm";
  label?: string;
  error?: string | undefined;
  hint?: string;
  /** Class on the 36px frame (use is-hover / is-focus to force a state). */
  frameClassName?: string;
}

export function TextInput({ icon, size = "md", label, error, hint, frameClassName, className, style, disabled, id, ...rest }: TextInputProps) {
  const auto = useId();
  const fid = id ?? auto;
  const msg = error ?? hint;
  return (
    <div className={cx("lm-field", className)} style={style}>
      {label ? (
        <label className="lm-field__label" htmlFor={fid}>
          {label}
        </label>
      ) : null}
      <div className={cx("lm-input", size === "sm" && "lm-input--sm", error && "is-error", disabled && "is-disabled", frameClassName)}>
        {icon ? <Icon name={icon} className="lm-input__icon" /> : null}
        <input id={fid} className="lm-input__field" disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={msg ? `${fid}-msg` : undefined} {...rest} />
      </div>
      {msg ? (
        <div id={`${fid}-msg`} className={error ? "lm-field__error" : "lm-field__hint"}>
          {msg}
        </div>
      ) : null}
    </div>
  );
}

export interface ToggleProps extends Omit<BtnAttrs, "onChange" | "role"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Deprecated, no effect: the switch is 32x20 everywhere. */
  board?: boolean;
}

/** Radix Switch under the Lumen toggle: role=switch, Space/Enter toggle, aria-checked drives the CSS. */
export function Toggle({ checked, defaultChecked = false, onChange, board: _board, className, ...rest }: ToggleProps) {
  return (
    <RSwitch.Root checked={checked} defaultChecked={checked === undefined ? defaultChecked : undefined} onCheckedChange={onChange} className={cx("lm-toggle", className)} {...rest}>
      <RSwitch.Thumb className="lm-toggle__knob" />
    </RSwitch.Root>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  indeterminate?: boolean;
  boxClassName?: string;
}

export function Checkbox({ label, indeterminate, className, disabled, boxClassName, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <label className={cx("lm-check", disabled && "is-disabled", className)}>
      <input ref={ref} type="checkbox" className="lm-check__input" disabled={disabled} {...rest} />
      <span className={cx("lm-check__box", boxClassName)}>
        <Icon name="check" size={12} />
        <Icon name="minus" size={12} />
      </span>
      {label}
    </label>
  );
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
}

export function Radio({ label, className, disabled, ...rest }: RadioProps) {
  return (
    <label className={cx("lm-radio", disabled && "is-disabled", className)}>
      <input type="radio" className="lm-check__input" disabled={disabled} {...rest} />
      <span className="lm-check__box" />
      {label}
    </label>
  );
}

export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  /** Fires while dragging and on key presses. */
  onChange?: (value: number) => void;
  /** Fires when the pointer is released or a key press ends (use it to save or seek). */
  onCommit?: (value: number) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  id?: string;
}

/** Radix Slider under tokens: 5px track, accent range, 16px white thumb. */
export function Slider({ min = 0, max = 100, step = 1, value, defaultValue = 0, onChange, onCommit, className, "aria-label": label, "aria-labelledby": labelledBy, ...rest }: SliderProps) {
  return (
    <RSlider.Root
      className={cx("lm-slider", className)}
      min={min}
      max={max}
      step={step}
      value={value === undefined ? undefined : [value]}
      defaultValue={value === undefined ? [Number(defaultValue)] : undefined}
      onValueChange={(v) => onChange?.(v[0] ?? min)}
      onValueCommit={(v) => onCommit?.(v[0] ?? min)}
      {...rest}
    >
      <RSlider.Track className="lm-slider__track">
        <RSlider.Range className="lm-slider__range" />
      </RSlider.Track>
      <RSlider.Thumb className="lm-slider__thumb" aria-label={label} aria-labelledby={labelledBy} />
    </RSlider.Root>
  );
}
