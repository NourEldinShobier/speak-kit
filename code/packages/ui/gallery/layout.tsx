import type { ReactNode } from "react";
import { Button, Icon } from "../src/index";

/* ---------- layout helpers ---------- */
type Bleed = { ring?: boolean; shadow?: [number, number] };

export function Cell({ id, label, bleed, children }: { id: string; label?: string; bleed?: Bleed | undefined; children: ReactNode }) {
  return (
    <figure className="g-cell">
      <div className="g-box" data-spec={id} data-ring={bleed?.ring ? "1" : undefined} data-shadow={bleed?.shadow ? bleed.shadow.join(" ") : undefined}>
        {children}
      </div>
      <figcaption>{label ?? id}</figcaption>
    </figure>
  );
}
export const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="g-group">
    <h3>{title}</h3>
    <div className="g-row">{children}</div>
  </section>
);
export const RING = { ring: true };
export const OVERLAY: Bleed = { shadow: [16, 48] };
export const MENU: Bleed = { shadow: [8, 24] };

/* ---------- state tables ---------- */
export const FORCED = {
  rest: {},
  hover: { className: "is-hover" },
  pressed: { className: "is-pressed" },
  focus: { className: "is-focus" },
  disabled: { disabled: true },
  loading: { loading: true },
} as const;
type St = keyof typeof FORCED;
export const STATES: St[] = ["rest", "hover", "pressed", "focus", "disabled", "loading"];

export function ButtonStates({ name, variant, label, icon }: { name: string; variant: "primary" | "secondary" | "ghost" | "danger"; label: string; icon?: Parameters<typeof Icon>[0]["name"] }) {
  return (
    <Group title={`Button · ${variant}`}>
      {STATES.map((s) => (
        <Cell key={s} id={`button-${name}-${s}`} bleed={s === "focus" ? RING : undefined}>
          <Button variant={variant} {...(icon ? { iconLeft: icon } : {})} {...FORCED[s]}>
            {label}
          </Button>
        </Cell>
      ))}
    </Group>
  );
}
