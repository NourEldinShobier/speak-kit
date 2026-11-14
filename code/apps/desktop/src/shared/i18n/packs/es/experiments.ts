import type { EXPERIMENTS } from "../experiments";

/** The cards on the Experiments page. */
export const ES_EXPERIMENTS: Record<keyof typeof EXPERIMENTS, string> = {
  "exp.turnOn": "Activar",
  "exp.turnOff": "Desactivar",
  "exp.turnOnTitle": "Activar {title}",
  "exp.turnOffTitle": "Desactivar {title}",
  "exp.failed": "No se pudo cambiar. Inténtalo de nuevo.",
};
