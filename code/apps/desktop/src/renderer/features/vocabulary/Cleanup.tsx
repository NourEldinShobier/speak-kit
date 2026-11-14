import { useState } from "react";
import { Chip, Select, SettingRow, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { patchDictation } from "../dictation-bridge";
import { cleanupRows, LANGUAGE_NAMES } from "./model";
import { RulesTester } from "./RulesTester";

const LANGUAGES = Object.entries(LANGUAGE_NAMES).map(([value, label]) => ({ value, label }));

/** The clean-up switches after the text is heard, for one language at a time, with the tester under them. */
export function Cleanup({ s }: { s: DictationStatus }) {
  const dictated = s.settings.language === "auto" ? "en" : s.settings.language;
  const [language, setLanguage] = useState<string>(dictated);
  const rows = cleanupRows(language);
  const c = s.settings.cleanup;
  return (
    <>
      <section className="lm-section" aria-labelledby="cleanup-title">
        <header className="lm-section__head vocab-head">
          <h3 className="lm-section__title" id="cleanup-title">
            Clean-up
          </h3>
          <span className="cleanup-lang">
            <label htmlFor="cleanup-language">Rules for</label>
            <Select id="cleanup-language" label="Rules for" size="sm" value={language} options={LANGUAGES} onChange={setLanguage} />
          </span>
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
      <RulesTester s={s} language={language} title="Try a sentence" lead="Type a sentence as the model might hear it. The rules above and your Vocabulary are applied. Nothing is saved." />
    </>
  );
}
