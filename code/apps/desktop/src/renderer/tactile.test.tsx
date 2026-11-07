import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { PlayerState } from "@speakkit/protocol";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { QuitDialog } from "./QuitDialog";
import { PlayerBar } from "./features/reader/PlayerBar";
import { BackToCurrent } from "./features/reader/ReaderParts";

const here = dirname(fileURLToPath(import.meta.url));
const cssFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return cssFiles(join(dir, e.name));
    return e.name.endsWith(".css") ? [join(dir, e.name)] : [];
  });
const css = (name: string) => readFileSync(join(here, name), "utf8");

const noop = () => {};
const bar = (status: string) =>
  renderToStaticMarkup(
    <PlayerBar
      state={{ status, elapsedMs: 5000, totalMs: 60000 } as unknown as PlayerState}
      estimatedTotalMs={60000}
      speed={1}
      voices={[]}
      voiceId="af_heart"
      sleepLeftMs={0}
      disabled={false}
      panel={null}
      volume={1}
      hidden={[]}
      onToggle={noop}
      onSkip={noop}
      onBlock={noop}
      onSeek={noop}
      onSpeed={noop}
      onVoice={noop}
      onSleep={noop}
      onOutline={noop}
      onVolume={noop}
      onShown={noop}
    />,
  );

describe("reader play button and Back to current use the shared buttons", () => {
  it("play and pause are the 40 px round primary icon button, not a hand-rolled one", () => {
    const play = /<button[^>]*aria-label="Play"[^>]*>/.exec(bar("paused"))![0];
    expect(play).toContain('class="lm-btn lm-btn--icon lm-btn--primary lm-btn--xl lm-btn--round"');
    expect(bar("playing")).toContain('aria-label="Pause"');
    expect(bar("playing")).not.toContain("rd-play");
  });

  it("Back to current is the shared small primary button with only a position class", () => {
    expect(renderToStaticMarkup(<BackToCurrent onClick={noop} />)).toContain('class="lm-btn lm-btn--primary lm-btn--sm rd-back"');
  });

  it("the duplicate .rd-play rules are gone and .rd-back only positions", () => {
    expect(css("features/reader/player.css")).not.toContain(".rd-play");
    const back = /\.rd-back \{([^}]*)\}/.exec(css("features/reader/reader.css"))![1]!;
    expect(back).not.toMatch(/background|color|box-shadow|border/);
  });
});

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

  it("body text is --text-primary", () => {
    expect(/\.sk-modal-text \{([^}]*)\}/.exec(css("overlays.css"))![1]).toContain("color: var(--text-primary)");
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

  it("chips, presets and pills squeeze to 0.97 on press", () => {
    expect(css("features/library/library.css")).toMatch(/\.lib-chip:active \{\s*scale: 0\.97;/);
    const player = css("features/reader/player.css");
    expect(player).toMatch(/\.rd-pill:active \{\s*scale: 0\.97;/);
    expect(player).toMatch(/\.rd-preset:active \{\s*scale: 0\.97;/);
  });

  it("voice cards align their Preview buttons: header min-height 32 and footer pushed down", () => {
    const pages = css("pages.css");
    expect(/\.sk-voice__h \{([^}]*)\}/.exec(pages)![1]).toContain("min-height: 32px");
    expect(/\.sk-voice__f \{([^}]*)\}/.exec(pages)![1]).toContain("margin-top: auto");
  });

  it("stat-card labels and panel captions are sentence case 12/16 weight 500; no whole-row opacity on the unavailable engine", () => {
    const pages = css("pages.css");
    for (const sel of [".sk-caps", ".sk-stat__k"]) {
      const body = new RegExp(`\\${sel} \\{([^}]*)\\}`).exec(pages)![1]!;
      expect(body).toContain("font-size: 12px");
      expect(body).toContain("line-height: 16px");
      expect(body).toContain("font-weight: 500");
      expect(body).not.toContain("uppercase");
    }
    expect(/\.sk-radio:disabled \{([^}]*)\}/.exec(css("setup.css"))![1]).not.toContain("opacity");
  });

  it("the document root uses tabular figures", () => {
    expect(/\nbody \{([^}]*)\}/.exec(css("shell.css"))![1]).toContain("font-variant-numeric: tabular-nums");
  });
});
