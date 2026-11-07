import { ProgressBar } from "@speakkit/ui";
import "./model-card.css";

/** "62% · 110 MB of 177 MB", or "Paused at 62% · 110 MB of 177 MB" when the download stopped. `pct` is 0..1. */
export function downloadLine(pct: number, totalMb: number, paused: boolean): string {
  const percent = Math.round(pct * 100);
  return `${paused ? "Paused at " : ""}${percent}% · ${Math.round(pct * totalMb)} MB of ${totalMb} MB`;
}

export interface ModelDownloadCardProps {
  name: string;
  pct: number;
  totalMb: number;
  paused: boolean;
}

/** Model download card (setup step 4, Engines page): name and progress line on the left, no badge, a 6 px bar across the card. */
export function ModelDownloadCard({ name, pct, totalMb, paused }: ModelDownloadCardProps) {
  return (
    <div className="lm-card mdc">
      <div className="mdc__text">
        <b className="mdc__name">{name}</b>
        <span className="mdc__line">{downloadLine(pct, totalMb, paused)}</span>
      </div>
      <ProgressBar className="mdc__bar" value={Math.round(pct * 100)} label="Download progress" />
    </div>
  );
}
