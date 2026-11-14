import type { APPS } from "../apps";

/** The installed-programs suggestions beside a program field. */
export const FR_APPS: Record<keyof typeof APPS, string> = {
  "apps.loading": "Recherche des applications installées...",
  "apps.unavailable": "La liste des applications installées n’a pas pu être obtenue ici. Saisissez plutôt le nom du programme.",
  "apps.noneFor": "Aucune application installée ne correspond à « {query} ». Vous pouvez quand même ajouter le nom saisi. Les applications du Store peuvent ne pas apparaître : saisissez leur nom.",
  "apps.none": "Aucune application installée trouvée. Les applications du Microsoft Store n’apparaissent pas : saisissez leur nom.",
  "apps.group": "Applications installées",
  "apps.use": "Utiliser {name}",
};
