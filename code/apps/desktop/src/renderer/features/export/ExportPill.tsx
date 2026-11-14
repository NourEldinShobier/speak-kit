import { ProgressBar } from "@speakkit/ui";
import { exportRunning } from "../../../shared/export";
import type { AppState } from "../../../shared/ipc";
import { useT } from "../../i18n";

/** Sidebar pill while exports run in the background. */
export function ExportPill({ s, onOpen }: { s: AppState; onOpen(jobId: string): void }) {
  const { t } = useT();
  const running = s.exports.filter(exportRunning);
  if (!running.length) return null;
  return (
    <div className="sk-exportpill" data-testid="export-pill">
      {running.map((e) => (
        <button key={e.id} type="button" className="sk-exportpill__row" onClick={() => onOpen(e.id)} aria-label={t("export.pillRow", { name: e.name, percent: Math.round(e.progress * 100) })}>
          <span>{e.name}</span>
          <ProgressBar thin block value={Math.round(e.progress * 100)} label={t("export.barLabel", { name: e.name })} />
        </button>
      ))}
    </div>
  );
}
