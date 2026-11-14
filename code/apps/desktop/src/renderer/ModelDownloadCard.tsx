import { ProgressBar } from "@speakkit/ui";
import { englishT, type TFn } from "../shared/i18n";
import { useT } from "./i18n";
import "./model-card.css";

/** "62% · 110 MB of 177 MB", or "Paused at 62% · 110 MB of 177 MB" when the download stopped. `pct` is 0..1. */
export function downloadLine({ pct, totalMb, paused }: { pct: number; totalMb: number; paused: boolean }, t: TFn = englishT): string {
  return t(paused ? "model.paused" : "model.progress", { percent: Math.round(pct * 100), done: Math.round(pct * totalMb), total: totalMb });
}

export interface ModelDownloadCardProps {
  name: string;
  pct: number;
  totalMb: number;
  paused: boolean;
}

/** Model download card (setup step 4, Engines page): name and progress line on the left, no badge, a 6 px bar across the card. */
export function ModelDownloadCard({ name, pct, totalMb, paused }: ModelDownloadCardProps) {
  const { t } = useT();
  return (
    <div className="lm-card mdc">
      <div className="mdc__text">
        <b className="mdc__name">{name}</b>
        <span className="mdc__line">{downloadLine({ pct, totalMb, paused }, t)}</span>
      </div>
      <ProgressBar block className="mdc__bar" value={Math.round(pct * 100)} label={t("model.progressLabel")} />
    </div>
  );
}
