import { Dialog as RDialog, Popover as RPopover, Select as RSelect } from "radix-ui";
import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import type { IconName } from "../icons";
import { IconButton } from "./controls";
import { cx, Icon } from "./shared";

/* Select, popover and dialog. Behaviour (focus, keyboard, dismissal, positioning) comes from Radix primitives; the markup keeps the Lumen classes. Floating content renders inline (no portal) so it inherits the `.lm` theme variables, which also works inside a shadow root. */

/* ---------------- Select (Radix) ---------------- */

export interface SelectOption {
  value: string;
  label: string;
  icon?: IconName;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Accessible name (required when there is no visible label). */
  label: string;
  size?: "md" | "sm";
  disabled?: boolean;
  /** Start open (gallery, tests). */
  defaultOpen?: boolean;
  className?: string;
  triggerClassName?: string;
  /** Custom trigger content instead of the selected label (for example an avatar plus a name). */
  renderValue?: (option: SelectOption | undefined) => ReactNode;
  id?: string;
}

/**
 * Dropdown: 32px trigger + the standard Menu surface, on Radix Select (listbox popup, Arrow keys, Home/End,
 * type-ahead, Enter/Space select, Escape closes and returns focus, outside click).
 */
export function Select({ options, value, defaultValue, onChange, label, size = "md", disabled, defaultOpen = false, className, triggerClassName, renderValue, id }: SelectProps) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const cur = value ?? inner;
  const selected = options.find((o) => o.value === cur);
  return (
    <RSelect.Root
      value={cur}
      onValueChange={(v) => {
        setInner(v);
        onChange?.(v);
      }}
      disabled={disabled}
      defaultOpen={defaultOpen}
    >
      <div className={cx("lm-select", size === "sm" && "lm-select--sm", disabled && "is-disabled", className)}>
        <RSelect.Trigger id={id} className={cx("lm-select__trigger", triggerClassName)} aria-label={label}>
          <span className="lm-select__value">
            <RSelect.Value>{renderValue ? renderValue(selected) : selected?.label}</RSelect.Value>
          </span>
          <RSelect.Icon asChild>
            <Icon name="chevron-down" size={16} />
          </RSelect.Icon>
        </RSelect.Trigger>
        <RSelect.Content position="popper" sideOffset={4} collisionPadding={8} className="lm-menu lm-menu--overlay lm-select__menu">
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item key={o.value} value={o.value} className="lm-menu__item">
                {o.icon ? <Icon name={o.icon} /> : null}
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="lm-menu__check">
                  <Icon name="check" size={14} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </div>
    </RSelect.Root>
  );
}

/* ---------------- Popover (Radix) ---------------- */

export function PopoverSurface({ title, className, children, ...rest }: { title?: string | undefined } & Omit<HTMLAttributes<HTMLDivElement>, "title">) {
  return (
    <div className={cx("lm-popover", className)} {...rest}>
      {title ? <h3 className="lm-popover__title">{title}</h3> : null}
      {children}
    </div>
  );
}

export interface PopoverProps {
  trigger: (p: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog" }) => ReactElement;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Width of the surface in px (default 320). */
  width?: number;
  className?: string;
  /** Hide the heading (the title stays as the accessible name). */
  hideTitle?: boolean;
}

/** Click-to-open panel next to the trigger on Radix Popover: Escape and outside click close it, focus returns to the trigger. */
export function Popover({ trigger, title, children, defaultOpen = false, open, onOpenChange, side = "bottom", align = "start", width, className, hideTitle }: PopoverProps) {
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  return (
    <RPopover.Root
      open={isOpen}
      onOpenChange={(o) => {
        setInner(o);
        onOpenChange?.(o);
      }}
    >
      <RPopover.Trigger asChild>{trigger({ onClick: () => {}, "aria-expanded": isOpen, "aria-haspopup": "dialog" })}</RPopover.Trigger>
      <RPopover.Content asChild side={side} align={align} sideOffset={6} collisionPadding={8}>
        <PopoverSurface aria-label={title} title={hideTitle ? undefined : title} className={cx("lm-popover--floating", className)} style={width ? { width } : undefined}>
          {children}
        </PopoverSurface>
      </RPopover.Content>
    </RPopover.Root>
  );
}

/* ---------------- Modal (Radix Dialog) ---------------- */

export interface DialogProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: string;
  footer?: ReactNode;
  width?: number;
  onClose?: () => void;
  titleId?: string;
}

/** The dialog surface (no scrim, no focus handling); Modal adds those. */
export function Dialog({ title, footer, width, onClose, titleId, children, className, style, ...rest }: DialogProps) {
  return (
    <div className={cx("lm-dialog", className)} style={{ width, ...style }} role="dialog" aria-modal="true" aria-labelledby={titleId} {...rest}>
      <div className="lm-dialog__head">
        <h2 id={titleId} className="lm-dialog__title">
          {title}
        </h2>
        {onClose ? <IconButton name="x" label="Close" size={24} onClick={onClose} /> : null}
      </div>
      <div className="lm-dialog__body">{children}</div>
      {footer ? <div className="lm-dialog__foot">{footer}</div> : null}
    </div>
  );
}

export interface ModalProps extends Omit<DialogProps, "titleId" | "onClose"> {
  open: boolean;
  onClose: () => void;
}

/** Scrim + dialog on Radix Dialog: focus moves in, Tab is trapped, Escape and scrim click close, focus returns to the opener. */
export function Modal({ open, onClose, title, footer, width, children, className, style }: ModalProps) {
  // Radix returns focus only to a Dialog.Trigger; this modal is opened from state, so remember the opener.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null;
  }, [open]);
  return (
    <RDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RDialog.Overlay className="lm-scrim">
        <RDialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus?.();
          }}
          className={cx("lm-dialog", className)}
          style={{ width, ...style }}
        >
          <div className="lm-dialog__head">
            <RDialog.Title className="lm-dialog__title">{title}</RDialog.Title>
            <RDialog.Close asChild>
              <IconButton name="x" label="Close" size={24} />
            </RDialog.Close>
          </div>
          <div className="lm-dialog__body">{children}</div>
          {footer ? <div className="lm-dialog__foot">{footer}</div> : null}
        </RDialog.Content>
      </RDialog.Overlay>
    </RDialog.Root>
  );
}
