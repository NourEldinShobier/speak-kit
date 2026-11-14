import type { EXPERIMENTS } from "../experiments";

/** The cards on the Experiments page. */
export const FR_EXPERIMENTS: Record<keyof typeof EXPERIMENTS, string> = {
  "exp.turnOn": "Activer",
  "exp.turnOff": "Désactiver",
  "exp.turnOnTitle": "Activer {title}",
  "exp.turnOffTitle": "Désactiver {title}",
  "exp.failed": "Cela n’a pas pu être modifié. Réessayez.",
};
