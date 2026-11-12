import { systemPreferences } from "electron";
import type { Config } from "../shared/schemas";
import { reduceMotion } from "../shared/settings/behaviour";

interface MotionTarget {
  isDestroyed(): boolean;
  webContents: { executeJavaScript(code: string): Promise<unknown>; on(event: "did-finish-load", listener: () => void): unknown };
}

/** The script that puts the Reduce motion decision on a page, where its style sheet reads it. */
export const motionScript = (on: boolean): string => `document.documentElement.setAttribute("data-reduce-motion", ${JSON.stringify(on ? "on" : "off")})`;

/** Keeps every window of the app (the pill, the mini player, the capsules) on one Reduce motion decision: applied when a page has loaded and whenever it changes. */
export function createWindowMotion() {
  let reduce = false;
  const targets = new Set<MotionTarget>();
  const apply = (t: MotionTarget) => void t.webContents.executeJavaScript(motionScript(reduce)).catch(() => {}); // the page can be gone by now
  return {
    add(t: MotionTarget): void {
      targets.add(t);
      t.webContents.on("did-finish-load", () => !t.isDestroyed() && apply(t));
    },
    set(on: boolean): void {
      reduce = on;
      for (const t of targets) {
        if (t.isDestroyed()) targets.delete(t);
        else apply(t);
      }
    },
  };
}

export const windowMotion = createWindowMotion();

/** Reduce motion as it is now: the app setting, else what the operating system asks. */
export const motionNow = (choice: Config["reduceMotion"]): boolean => reduceMotion(choice, systemPreferences.getAnimationSettings().prefersReducedMotion) === "on";
