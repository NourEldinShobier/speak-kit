import type { APPS } from "../apps";

/** The installed-programs suggestions beside a program field. */
export const ES_APPS: Record<keyof typeof APPS, string> = {
  "apps.loading": "Buscando aplicaciones instaladas...",
  "apps.unavailable": "No se pudo obtener la lista de aplicaciones instaladas. Escribe el nombre del programa.",
  "apps.noneFor": "Ninguna aplicación instalada coincide con «{query}». Aun así puedes añadir el nombre que escribiste. Es posible que las aplicaciones de la tienda no aparezcan: escribe su nombre.",
  "apps.none": "No se encontraron aplicaciones instaladas. Las aplicaciones de Microsoft Store no aparecen: escribe su nombre.",
  "apps.group": "Aplicaciones instaladas",
  "apps.use": "Usar {name}",
};
