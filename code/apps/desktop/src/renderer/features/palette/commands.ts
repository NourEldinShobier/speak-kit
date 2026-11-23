import type { Command, PaletteAction } from "./model";
import type { ShellAction } from "../../shell-model";

interface CommandContext {
  dispatch(a: ShellAction): void;
  /** Starts or stops the preview of a voice. */
  preview(voice: string, text: string): void;
}

type Runners = { [K in PaletteAction["type"]]: (a: Extract<PaletteAction, { type: K }>, c: Command, x: CommandContext) => void };

const RUNNERS: Runners = {
  nav: (a, _c, x) => x.dispatch({ type: "go", page: a.page, ...(a.sub ? { sub: a.sub } : {}) }),
  "open-doc": (a, _c, x) => {
    x.dispatch({ type: "go", page: "library" });
    x.dispatch({ type: "open-doc", doc: { id: a.id, autoplay: false } });
  },
  preview: (a, c, x) => x.preview(a.voice, `Hello, this is ${c.title}.`),
};

/** Runs the action of a palette command; closes the palette first. */
export function runCommand(c: Command, x: CommandContext) {
  x.dispatch({ type: "palette", open: false });
  const run = RUNNERS[c.action.type] as (a: PaletteAction, c: Command, x: CommandContext) => void;
  run(c.action, c, x);
}
