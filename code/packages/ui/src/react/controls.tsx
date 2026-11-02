import { Slider as RSlider, Switch as RSwitch } from "radix-ui";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import type { IconName } from "../icons";
import { cx, Icon } from "./shared";

type BtnAttrs = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export interface ButtonProps extends BtnAttrs {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  /** Filled red (confirmed destructive action in dialogs). */
  solid?: boolean;
  iconLeft?: IconName;
  iconRight?: IconName;
  /** Spinner replaces the leading icon (or is added when there is none); width stays. */
  loading?: boolean;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", solid, iconLeft, iconRight, loading, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  const lead = loading ? "loader-2" : iconLeft;
  return (
    <button
      type={type}
      className={cx("lm-btn", `lm-btn--${variant}`, solid && "lm-btn--danger-solid", size === "sm" && "lm-btn--sm", size === "lg" && "lm-btn--lg", loading && "is-loading", className)}
      disabled={disabled}
      aria-busy={loading ? "true" : undefined}
      {...rest}
    >
      {lead ? <Icon name={lead} className={loading ? "lm-spin" : undefined} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} /> : null}
    </button>
  );
}

export interface IconButtonProps extends BtnAttrs {
  name: IconName;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  size?: 32 | 28 | 24;
  /** 36px circle (composer). */
  round?: boolean;
  loading?: boolean;
}

export function IconButton({ name, label, size = 32, round, loading, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-busy={loading ? "true" : undefined}
      className={cx("lm-btn lm-btn--icon", size === 28 && "lm-btn--sm", size === 24 && "lm-btn--xs", round && "lm-btn--round", loading && "is-loading", className)}
      {...rest}
    >
      <Icon name={loading ? "loader-2" : name} size={size === 24 ? 14 : 16} className={loading ? "lm-spin" : undefined} />
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
  /** md = 36px, sm = 32px (popovers). */
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
  /** 40x20 board geometry instead of the 32x18 screen toggle. */
  board?: boolean;
}

/** Radix Switch under the Lumen toggle: role=switch, Space/Enter toggle, aria-checked drives the CSS. */
export function Toggle({ checked, defaultChecked = false, onChange, board, className, ...rest }: ToggleProps) {
  return (
    <RSwitch.Root
      checked={checked}
      defaultChecked={checked === undefined ? defaultChecked : undefined}
      onCheckedChange={onChange}
      className={cx("lm-toggle", board && "lm-toggle--board", className)}
      {...rest}
    >
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
        <Icon name="check" size={14} />
        <Icon name="minus" size={14} />
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

/** Radix Slider under tokens (Lumen has no slider): 4px track, accent range, 14px white thumb. */
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
