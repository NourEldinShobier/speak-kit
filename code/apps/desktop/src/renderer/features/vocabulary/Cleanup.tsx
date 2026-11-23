import { Chip, SettingRow, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { patchDictation } from "../dictation-bridge";
import { cleanupRows } from "./model";

/** The clean-up switches after the text is heard, with the language rules for the dictation language. */
export function Cleanup({ s }: { s: DictationStatus }) {
  const rows = cleanupRows(s.settings.language);
  const c = s.settings.cleanup;
  return (
    <section className="lm-section" aria-labelledby="cleanup-title">
      <header className="lm-section__head vocab-head">
        <h3 className="lm-section__title" id="cleanup-title">
          Clean-up
        </h3>
        <p className="lm-section__desc">What Speak Kit fixes after it hears you.</p>
      </header>
      <div className="lm-card">
        {rows.map((r) => (
          <SettingRow
            key={r.key}
            label={r.label}
            description={r.unavailable ?? r.description}
            control={
              <span className="cleanup-ctl">
                {r.scope ? <Chip>{r.scope}</Chip> : null}
                <Toggle aria-label={r.label} checked={!r.unavailable && c[r.key]} disabled={!!r.unavailable} onChange={(on) => void patchDictation({ cleanup: { ...c, [r.key]: on } })} />
              </span>
            }
          />
        ))}
      </div>
    </section>
  );
}
