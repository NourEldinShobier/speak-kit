import type { EXPERIMENTS } from "../experiments";

/** The cards on the Experiments page. */
export const DE_EXPERIMENTS: Record<keyof typeof EXPERIMENTS, string> = {
  "exp.turnOn": "Einschalten",
  "exp.turnOff": "Ausschalten",
  "exp.turnOnTitle": "{title} einschalten",
  "exp.turnOffTitle": "{title} ausschalten",
  "exp.failed": "Das ließ sich nicht ändern. Versuche es erneut.",
};
