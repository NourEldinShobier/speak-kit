import type { APPS } from "../apps";

/** The installed-programs suggestions beside a program field. */
export const DE_APPS: Record<keyof typeof APPS, string> = {
  "apps.loading": "Installierte Apps werden gesucht...",
  "apps.unavailable": "Die installierten Apps konnten hier nicht aufgelistet werden. Gib stattdessen den Programmnamen ein.",
  "apps.noneFor": "Keine installierte App passt zu „{query}“. Du kannst den eingegebenen Namen trotzdem hinzufügen. Store-Apps werden eventuell nicht aufgelistet: Gib ihren Namen ein.",
  "apps.none": "Keine installierten Apps gefunden. Apps aus dem Microsoft Store werden nicht aufgelistet: Gib ihren Namen ein.",
  "apps.group": "Installierte Apps",
  "apps.use": "{name} verwenden",
};
