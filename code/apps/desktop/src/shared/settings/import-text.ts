import { translate, type Locale } from "../i18n";
import type { ImportOutcome } from "../ipc";

const SHOWN = 8;
const list = (names: string[]) => (names.length > SHOWN ? `${names.slice(0, SHOWN).join(", ")} +${names.length - SHOWN}` : names.join(", "));

/** What the banner says after an import: how many settings were applied, which of them changed, and which were left out. */
export function importMessage(locale: Locale, o: Extract<ImportOutcome, { status: "imported" }>): string {
  const vars = { n: o.applied, changed: list(o.changed), skipped: o.skipped.join(", ") };
  const skipped = o.skipped.length > 0;
  if (o.changed.length === 0) return translate(locale, skipped ? "general.importSkipped" : "general.importDone", vars);
  return translate(locale, skipped ? "general.importChangedSkipped" : "general.importChanged", vars);
}
