import { parseHTML } from "linkedom";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { Avatar, Button, IconButton, Kbd, Logo, MenuItem, ProgressBar, StatusPill, Toggle, TooltipSurface } from "../src/index";

/** Vanilla builders write DOM, React writes a string: both are reduced to one canonical string (sorted classes and attributes, no ids). */
const norm = (n: Node): string => {
  if (n.nodeType === 3) return n.textContent ?? "";
  const el = n as Element;
  const attrs = [...el.attributes]
    .map((a) => {
      let v = a.value;
      if (a.name === "id" || a.name === "aria-describedby") v = "#";
      if (a.name === "class") v = v.split(/\s+/).sort().join(" ");
      if (a.name === "style") v = v.replace(/[\s;]+/g, "");
      return `${a.name}=${v}`;
    })
    .sort()
    .join(" ");
  return `<${el.localName} ${attrs}>${[...el.childNodes].map(norm).join("")}</${el.localName}>`;
};

let V: typeof import("../src/vanilla");
const react = (ui: ReactNode) => norm(parseHTML(`<!doctype html><html><body>${renderToStaticMarkup(ui)}</body></html>`).document.body.firstChild as Node);

beforeAll(async () => {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  const g = globalThis as Record<string, unknown>;
  const w = window as unknown as Record<string, unknown>;
  for (const k of ["Node", "Element", "HTMLElement", "SVGElement", "Text", "DocumentFragment", "Event"]) g[k] = w[k];
  Object.assign(g, { window, document });
  V = await import("../src/vanilla");
});

const noop = () => {};

describe("vanilla builders emit the markup of the React components", () => {
  test("button variants, sizes, icons, loading and disabled", () => {
    expect(norm(V.button({ variant: "primary", iconLeft: "arrow-narrow-up", label: "Send" }))).toBe(
      react(
        <Button variant="primary" iconLeft="arrow-narrow-up">
          Send
        </Button>,
      ),
    );
    expect(norm(V.button({ size: "sm", iconRight: "chevron-down", label: "More" }))).toBe(
      react(
        <Button size="sm" iconRight="chevron-down">
          More
        </Button>,
      ),
    );
    expect(norm(V.button({ variant: "danger", loading: true, label: "Delete" }))).toBe(
      react(
        <Button variant="danger" loading>
          Delete
        </Button>,
      ),
    );
    expect(norm(V.button({ variant: "ghost", disabled: true, iconLeft: "refresh", label: "Rewrite" }))).toBe(
      react(
        <Button variant="ghost" disabled iconLeft="refresh">
          Rewrite
        </Button>,
      ),
    );
  });

  test("icon buttons, plain and round loading", () => {
    expect(norm(V.iconButton({ name: "dots", label: "More", size: 28 }))).toBe(react(<IconButton name="dots" label="More" size={28} />));
    expect(norm(V.iconButton({ name: "plus", label: "Add", round: true, loading: true }))).toBe(react(<IconButton name="plus" label="Add" round loading />));
  });

  test("toggle on, and board geometry disabled", () => {
    expect(norm(V.toggle({ checked: true, label: "X" }))).toBe(react(<Toggle checked aria-label="X" />));
    expect(norm(V.toggle({ board: true, disabled: true, label: "X" }))).toBe(react(<Toggle board disabled aria-label="X" />));
  });

  test("pill with and without a tone, kbd, logo, avatar", () => {
    expect(norm(V.pill("Indexing", "blue", "loader-2"))).toBe(
      react(
        <StatusPill tone="blue" icon="loader-2">
          Indexing
        </StatusPill>,
      ),
    );
    expect(norm(V.pill("Neutral"))).toBe(react(<StatusPill>Neutral</StatusPill>));
    expect(norm(V.kbd("Ctrl"))).toBe(react(<Kbd>Ctrl</Kbd>));
    expect(norm(V.kbd("Ctrl", true))).toBe(react(<Kbd small>Ctrl</Kbd>));
    expect(norm(V.logo(28))).toBe(react(<Logo size={28} />));
    expect(norm(V.avatar("Heart", 24))).toBe(react(<Avatar name="Heart" size={24} />));
  });

  test("menu item with icon, shortcut and selection", () => {
    expect(norm(V.menuItem({ label: "Rename", icon: "pencil", shortcut: "Ctrl E", selected: true, onSelect: noop }))).toBe(
      react(
        <MenuItem icon="pencil" shortcut="Ctrl E" selected>
          Rename
        </MenuItem>,
      ),
    );
    expect(norm(V.menuItem({ label: "Delete", destructive: true, onSelect: noop }))).toBe(react(<MenuItem destructive>Delete</MenuItem>));
  });

  test("progress bar, determinate thin and indeterminate", () => {
    expect(norm(V.progress(40, { thin: true, label: "Progress" }).el)).toBe(react(<ProgressBar value={40} thin label="Progress" />));
    expect(norm(V.progress(undefined, { label: "Working" }).el)).toBe(react(<ProgressBar label="Working" />));
  });

  test("tooltip surface carries its text and the shortcut", () => {
    const wrapped = V.tooltip(V.iconButton({ name: "settings", label: "Settings" }), "Settings", "Ctrl ,");
    expect(norm(wrapped.querySelector("[role=tooltip]")!)).toBe(react(<TooltipSurface id="x" text="Settings" shortcut="Ctrl ," />));
  });
});
