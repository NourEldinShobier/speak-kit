import { useEffect, useRef, useState } from "react";
import { searchApps, type InstalledApp } from "@speakkit/dictation";
import { dictation } from "../dictation-bridge";
import "./apps.css";

type Found = { status: "loading" } | { status: "ready"; apps: InstalledApp[] } | { status: "unavailable" };

/** The installed programs, asked for once when `active` turns true (the picker opened or its field got focus). */
export function useInstalledApps(active: boolean): Found {
  const [found, setFound] = useState<Found>({ status: "loading" });
  const asked = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  useEffect(() => {
    if (!active || asked.current) return;
    asked.current = true;
    dictation.installedApps().then(
      (r) => alive.current && setFound(r.available ? { status: "ready", apps: r.apps } : { status: "unavailable" }),
      () => alive.current && setFound({ status: "unavailable" }),
    );
  }, [active]);
  return found;
}

const SHOWN = 6;

/** Installed programs that match what is typed. `skip` lists keys already chosen. Picking one hands back its key; typing the name stays possible when the list is missing. */
export function AppSuggestions({ query, skip, active, onPick }: { query: string; skip: readonly string[]; active: boolean; onPick(app: InstalledApp): void }) {
  const found = useInstalledApps(active);
  if (!active) return null;
  if (found.status === "loading") return <p className="apps-note">Looking for installed apps...</p>;
  if (found.status === "unavailable") return <p className="apps-note">The installed apps could not be listed here. Type the program name instead.</p>;
  const hits = searchApps(
    found.apps.filter((a) => !skip.includes(a.key)),
    query,
    SHOWN,
  );
  if (hits.length === 0) return <p className="apps-note">{query.trim() ? `No installed app matches "${query.trim()}". You can still add the name you typed.` : "No installed apps found."}</p>;
  return (
    <div className="apps-list" role="group" aria-label="Installed apps">
      {hits.map((a) => (
        <button key={a.key} type="button" className="apps-item" aria-label={`Use ${a.name}`} onClick={() => onPick(a)}>
          <span className="apps-item__name">{a.name}</span>
          <span className="apps-item__key">{a.key}</span>
        </button>
      ))}
    </div>
  );
}
