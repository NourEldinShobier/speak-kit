import { useEffect, useRef, useState } from "react";
import { searchApps, type InstalledApp } from "@speakkit/dictation";
import "../../../shared/i18n/packs/apps";
import { useT } from "../../i18n";
import { dictation } from "../dictation-bridge";
import { loadInstalledApps, type Found } from "./load";
import "./apps.css";

/** The installed programs, asked for once when `active` turns true (the picker opened or its field got focus). */
export function useInstalledApps(active: boolean): Found {
  const [found, setFound] = useState<Found>({ status: "loading" });
  const asked = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  useEffect(() => {
    if (!active || asked.current) return;
    asked.current = true;
    void loadInstalledApps((refresh) => dictation.installedApps(refresh)).then((f) => alive.current && setFound(f));
  }, [active]);
  return found;
}

const SHOWN = 6;

/** Installed programs that match what is typed. `skip` lists keys already chosen. Picking one hands back its key; typing the name stays possible when the list is missing. */
export function AppSuggestions({ query, skip, active, onPick }: { query: string; skip: readonly string[]; active: boolean; onPick(app: InstalledApp): void }) {
  const found = useInstalledApps(active);
  const { t } = useT();
  if (!active) return null;
  if (found.status === "loading") return <p className="apps-note">{t("apps.loading")}</p>;
  if (found.status === "unavailable") return <p className="apps-note">{t("apps.unavailable")}</p>;
  const hits = searchApps(
    found.apps.filter((a) => !skip.includes(a.key)),
    query,
    SHOWN,
  );
  if (hits.length === 0) return <p className="apps-note">{query.trim() ? t("apps.noneFor", { query: query.trim() }) : t("apps.none")}</p>;
  return (
    <div className="apps-list" role="group" aria-label={t("apps.group")}>
      {hits.map((a) => (
        <button key={a.key} type="button" className="apps-item" aria-label={t("apps.use", { name: a.name })} onClick={() => onPick(a)}>
          <span className="apps-item__name">{a.name}</span>
          <span className="apps-item__key">{a.key}</span>
        </button>
      ))}
    </div>
  );
}
