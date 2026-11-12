import type { IpcMain, IpcMainEvent } from "electron";
import * as v from "valibot";
import { OVERLAY_RESULT } from "../../../shared/capture/channels";
import { OverlayResultSchema, type OverlayView } from "../../../shared/capture/contract";
import type { OverlayHandle } from "../windows";
import { startMode, type DisplayGeometry, type WindowGeometry } from "./index";
import type { Target } from "../session";

export interface PickerDeps {
  ipcMain: IpcMain;
  displays(): DisplayGeometry[];
  windows(): Promise<WindowGeometry[]>;
  /** Opens the overlay window over a display; `sender` ids are used to tell which display answered. */
  open(display: DisplayGeometry): OverlayHandle;
  lastTargets(): Record<string, "screen" | "window" | "area">;
  windowPicker: boolean;
}

export interface PickerFlow {
  /** Shows the picker on every display. Resolves with the choice, or null on Esc, on a click outside any target, or when `signal` aborts. */
  pick(signal: AbortSignal, switching: boolean): Promise<Target | null>;
  dispose(): void;
}

const viewOf = (d: DisplayGeometry, mode: OverlayView["mode"], from: { windows: readonly WindowGeometry[]; switching: boolean }): OverlayView => {
  const { windows, switching } = from;
  return {
    mode,
    display: { id: d.id, name: d.name, width: d.bounds.width, height: d.bounds.height, scaleFactor: d.scaleFactor },
    windows: windows.map((w) => ({ id: w.id, title: w.title, x: w.rect.x - d.bounds.x, y: w.rect.y - d.bounds.y, width: w.rect.width, height: w.rect.height })),
    switching,
  };
};

/** The overlay picker over every display. The first answer wins and every overlay closes; Esc, abort and a closed window are all the same clean exit. */
export function createPickerFlow(d: PickerDeps): PickerFlow {
  let finish: ((t: Target | null) => void) | undefined;
  const owners = new Map<number, { display: DisplayGeometry; handle: OverlayHandle }>();
  let windowsNow: readonly WindowGeometry[] = [];

  const onResult = (e: IpcMainEvent, raw: unknown) => {
    const owner = owners.get(e.sender.id);
    const parsed = v.safeParse(OverlayResultSchema, raw);
    if (!owner || !parsed.success) return;
    finish?.(toTarget(parsed.output, owner.display, windowsNow));
  };
  d.ipcMain.on(OVERLAY_RESULT, onResult);

  return {
    async pick(signal, switching) {
      if (finish) return null;
      windowsNow = d.windowPicker ? await d.windows() : [];
      return new Promise<Target | null>((resolve) => {
        const handles: OverlayHandle[] = [];
        const done = (t: Target | null) => {
          if (!finish) return;
          finish = undefined;
          signal.removeEventListener("abort", onAbort);
          for (const h of handles) h.close();
          owners.clear();
          resolve(t);
        };
        const onAbort = () => done(null);
        finish = done;
        if (signal.aborted) return done(null);
        signal.addEventListener("abort", onAbort);
        for (const display of d.displays()) {
          const handle = d.open(display);
          handles.push(handle);
          owners.set(handle.window.webContents.id, { display, handle });
          handle.window.once("closed", () => done(null));
          void handle.show(viewOf(display, d.windowPicker ? startMode(d.lastTargets(), display.id) : "screen", { windows: windowsNow, switching }));
        }
      });
    },
    dispose: () => {
      d.ipcMain.off(OVERLAY_RESULT, onResult);
      finish?.(null);
    },
  };
}

type Result = v.InferOutput<typeof OverlayResultSchema>;

/** The overlay's answer as a capture target. A window that is gone by now is a cancel. */
export function toTarget(r: Result, display: DisplayGeometry, windows: readonly WindowGeometry[]): Target | null {
  if (!r) return null;
  if (r.kind === "screen") return { kind: "screen", displayId: display.id };
  if (r.kind === "area") return { kind: "area", displayId: display.id, rect: { x: display.bounds.x + r.x, y: display.bounds.y + r.y, width: r.width, height: r.height } };
  const w = windows.find((x) => x.id === r.windowId);
  return w ? { kind: "window", windowId: w.id, title: w.title } : null;
}
