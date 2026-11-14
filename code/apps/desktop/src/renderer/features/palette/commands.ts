import type { AppState } from "../../../shared/ipc";
import type { Command, PaletteAction } from "./model";
import type { ShellAction } from "../../shell-model";
import { api } from "../../ui";
import { change } from "../../change";

interface CommandContext {
  s: AppState;
  dispatch(a: ShellAction): void;
  /** Stops a voice preview. */
  halt(): void;
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
  pause: (_a, _c, x) => x.halt(),
  "copy-token": (_a, _c, x) => void api.copy(x.s.token),
  "open-logs": () => void api.openPath("logs"),
  "toggle-reading": () => void api.reader({ type: "toggle" }),
  export: (_a, _c, x) => x.dispatch({ type: "export", open: { text: "" } }),
  "check-updates": () => void api.updateAction("check"),
  dnd: (_a, _c, x) => void change({ doNotDisturb: !x.s.config.doNotDisturb }),
  "install-extension": (_a, _c, x) => x.dispatch({ type: "go", page: "settings", sub: "browser" }),
  "load-engine": () => void api.warmEngine(),
  preview: (a, c, x) => x.preview(a.voice, `Hello, this is ${c.title}.`),
};

/** Runs the action of a palette command; closes the palette first. */
export function runCommand(c: Command, x: CommandContext) {
  x.dispatch({ type: "palette", open: false });
  const run = RUNNERS[c.action.type] as (a: PaletteAction, c: Command, x: CommandContext) => void;
  run(c.action, c, x);
}
