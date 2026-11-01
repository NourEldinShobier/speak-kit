import type { AppState } from "../shared/ipc";
import type { Command, PaletteAction } from "../shared/palette";
import type { ShellAction } from "./shell-model";
import { api } from "./ui";

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
  "new-reading": (_a, _c, x) => x.dispatch({ type: "open-reading", text: "" }),
  pause: (_a, _c, x) => x.halt(),
  "copy-token": (_a, _c, x) => void api.copy(x.s.token),
  "open-logs": () => void api.openPath("logs"),
  "read-clipboard": () => void api.readClipboard(),
  "toggle-reading": () => void api.reader({ type: "toggle" }),
  export: (_a, _c, x) => x.dispatch({ type: "export", open: { text: "" } }),
  "check-updates": () => void api.updateAction("check"),
  dnd: (_a, _c, x) => void api.patchConfig({ doNotDisturb: !x.s.config.doNotDisturb }),
  "install-extension": (_a, _c, x) => x.dispatch({ type: "go", page: "browser" }),
  "load-engine": () => void api.warmEngine(),
  preview: (a, c, x) => x.preview(a.voice, `Hello, this is ${c.title.replace("Preview ", "")}.`),
};

/** Runs the action of a palette command; closes the palette first. */
export function runCommand(c: Command, x: CommandContext) {
  x.dispatch({ type: "palette", open: false });
  const run = RUNNERS[c.action.type] as (a: PaletteAction, c: Command, x: CommandContext) => void;
  run(c.action, c, x);
}
