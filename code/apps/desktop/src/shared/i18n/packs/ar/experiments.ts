import type { EXPERIMENTS } from "../experiments";

/** The cards on the Experiments page. */
export const AR_EXPERIMENTS: Record<keyof typeof EXPERIMENTS, string> = {
  "exp.turnOn": "تشغيل",
  "exp.turnOff": "إيقاف",
  "exp.turnOnTitle": "تشغيل {title}",
  "exp.turnOffTitle": "إيقاف {title}",
  "exp.failed": "تعذّر تغيير ذلك. حاول مرة أخرى.",
};
