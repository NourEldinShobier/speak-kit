import { useEffect } from "react";
import type { AppState } from "../../../shared/ipc";
import { reduceMotion } from "../../../shared/settings/behaviour";

const query = () => (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null);

/** Puts the reduce-motion decision on the document so the style sheet can follow it. */
export function useMotionPreference(choice: AppState["config"]["reduceMotion"]): void {
  useEffect(() => {
    const mq = query();
    const apply = () => document.documentElement.setAttribute("data-reduce-motion", reduceMotion(choice, mq?.matches ?? false));
    apply();
    mq?.addEventListener("change", apply);
    return () => mq?.removeEventListener("change", apply);
  }, [choice]);
}
