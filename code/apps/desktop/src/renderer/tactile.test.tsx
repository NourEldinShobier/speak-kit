import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { QuitDialog } from "./QuitDialog";

const here = dirname(fileURLToPath(import.meta.url));
const cssFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return cssFiles(join(dir, e.name));
    return e.name.endsWith(".css") ? [join(dir, e.name)] : [];
  });

const noop = () => {};

describe("Quit dialog", () => {
  it("'Keep running in tray' takes the initial focus (data-autofocus), the safe action", () => {
    const modal = QuitDialog({ s: appState(), open: true, playing: false, onClose: noop }) as ReactElement<{ footer: ReactNode }>;
    const footer = modal.props.footer as ReactElement<{ children: ReactNode[] }>;
    const first = footer.props.children[0] as ReactElement<Record<string, unknown>>;
    expect(isValidElement(first)).toBe(true);
    expect(first.props["data-autofocus"]).toBe(true);
    expect(first.props.children).toBe("Keep running in tray");
    expect(footer.props.children.slice(1).some((c) => isValidElement(c) && (c.props as Record<string, unknown>)["data-autofocus"])).toBe(false);
  });

  it("'Quit' is the destructive button and 'Keep running in tray' the plain secondary one", () => {
    const modal = QuitDialog({ s: appState(), open: true, playing: false, onClose: noop }) as ReactElement<{ footer: ReactNode }>;
    const [keep, , quit] = (modal.props.footer as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>).props.children;
    expect([keep!.props["variant"], keep!.props["solid"], keep!.props.children]).toEqual([undefined, undefined, "Keep running in tray"]);
    expect([quit!.props["variant"], quit!.props["solid"], quit!.props.children]).toEqual(["danger", undefined, "Quit"]);
  });
});

/** Every :hover selector must sit inside a (hover: hover) and (pointer: fine) block; forced .is-hover selectors stay outside. */
function bareHover(text: string): string[] {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (c === "{") {
      const prelude = stripped.slice(start, i).trim();
      if (!prelude.startsWith("@") && prelude.includes(":hover") && !stack.some((p) => /hover:\s*hover/.test(p) && /pointer:\s*fine/.test(p))) out.push(prelude);
      stack.push(prelude);
      start = i + 1;
    } else if (c === "}") {
      stack.pop();
      start = i + 1;
    } else if (c === ";") start = i + 1;
  }
  return out;
}

describe("tactile CSS", () => {
  it("no desktop stylesheet has a :hover rule outside the fine-pointer media query", () => {
    for (const f of cssFiles(here)) expect(bareHover(readFileSync(f, "utf8")), f).toEqual([]);
  });

  it("the scanner flags a bare :hover rule", () => {
    expect(bareHover(".a:hover { color: red; }")).toEqual([".a:hover"]);
    expect(bareHover("@media (hover: hover) and (pointer: fine) { .a:hover { color: red; } }")).toEqual([]);
  });
});
