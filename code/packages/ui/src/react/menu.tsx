import { DropdownMenu as RMenu } from "radix-ui";
import { type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import type { IconName } from "../icons";
import { cx, Icon } from "./shared";

/*
 * Behaviour (focus, keyboard, dismissal, positioning) comes from Radix primitives; the markup keeps the
 * classes, so the look is the contract in styles.css. Floating content renders inline (no portal) so it inherits
 * the `.lm` theme variables, which also works inside a shadow root or a popup.
 */

export interface MenuProps extends HTMLAttributes<HTMLDivElement> {
  /** 32px items with 12px shortcuts (context menus), instead of 30px. */
  large?: boolean;
  /** Overlay shadow (0 16 48) instead of the menu shadow (0 8 24). */
  overlay?: boolean;
}

const ITEM = '[role="menuitem"]:not([aria-disabled="true"])';

/** role=menu surface with roving focus (Arrow Up/Down, Home, End) for always-open menus; use DropdownMenu for a trigger. */
export function Menu({ large, overlay, className, onKeyDown, children, ...rest }: MenuProps) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(ITEM)];
    const i = items.indexOf(document.activeElement as HTMLElement);
    let n = -1;
    if (e.key === "ArrowDown") n = (i + 1) % items.length;
    else if (e.key === "ArrowUp") n = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    items[n]?.focus();
  };
  return (
    <div role="menu" className={cx("lm-menu", large && "lm-menu--lg", overlay && "lm-menu--overlay", className)} onKeyDown={onKey} {...rest}>
      {children}
    </div>
  );
}

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> {
  icon?: IconName;
  shortcut?: string | undefined;
  /** Shows the trailing check (current choice). */
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export function MenuItem({ icon, shortcut, selected, destructive, disabled, onSelect, className, onClick, children, ...rest }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled ? "true" : undefined}
      className={cx("lm-menu__item", destructive && "is-destructive", className)}
      onClick={(e) => {
        if (disabled) return;
        onClick?.(e);
        onSelect?.();
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      <span className="lm-menu__label">{children}</span>
      {shortcut ? <span className="lm-menu__shortcut">{shortcut}</span> : null}
      {selected ? <Icon name="check" size={14} className="lm-menu__check" /> : null}
    </button>
  );
}

export const MenuSeparator = () => <div role="separator" className="lm-menu__sep" />;
export const MenuGroupLabel = ({ children }: { children: ReactNode }) => <div className="lm-menu__group">{children}</div>;

export interface DropdownMenuProps {
  /** The element that opens the menu (a Button, IconButton ...); it receives the trigger props. */
  trigger: ReactElement;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  large?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** Trigger + menu. Arrow keys, Home/End, type-ahead, Escape (focus returns to the trigger) and outside click come from Radix. */
export function DropdownMenu({ trigger, children, side = "bottom", align = "end", large, className, ...root }: DropdownMenuProps) {
  return (
    <RMenu.Root {...root}>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <RMenu.Content side={side} align={align} sideOffset={6} collisionPadding={8} className={cx("lm-menu lm-menu--overlay lm-menu--floating", large && "lm-menu--lg", className)}>
        {children}
      </RMenu.Content>
    </RMenu.Root>
  );
}

export interface DropdownMenuItemProps {
  icon?: IconName;
  shortcut?: string;
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  className?: string;
  children?: ReactNode;
}

export function DropdownMenuItem({ icon, shortcut, selected, destructive, disabled, onSelect, className, children }: DropdownMenuItemProps) {
  return (
    <RMenu.Item disabled={disabled} onSelect={() => onSelect?.()} className={cx("lm-menu__item", destructive && "is-destructive", className)}>
      {icon ? <Icon name={icon} /> : null}
      <span className="lm-menu__label">{children}</span>
      {shortcut ? <span className="lm-menu__shortcut">{shortcut}</span> : null}
      {selected ? <Icon name="check" size={14} className="lm-menu__check" /> : null}
    </RMenu.Item>
  );
}

export const DropdownMenuSeparator = () => <RMenu.Separator className="lm-menu__sep" />;
export const DropdownMenuLabel = ({ children }: { children: ReactNode }) => <RMenu.Label className="lm-menu__group">{children}</RMenu.Label>;
