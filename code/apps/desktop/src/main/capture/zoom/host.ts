import { contactSheetPlan } from "../keyframes";
import type { RecorderHost } from "../recorder-host";
import type { HistoryDeps } from "../history";

const TEN_MINUTES = 10 * 60_000;

/** The parts of the recorder window the editing of a recording uses: cutting the video, showing parts of it closer, and the contact sheet of those parts. */
export function recorderEditing(host: () => RecorderHost): Pick<HistoryDeps, "trim" | "zoomVideo" | "zoomSheet"> {
  return {
    trim: async (video, startMs, endMs) => {
      const r = await host().call({ op: "trim", video, startMs, endMs }, TEN_MINUTES);
      return r.ok ? r.video : undefined;
    },
    zoomVideo: async (video, regions) => {
      const r = await host().call({ op: "zoom", video, regions }, TEN_MINUTES);
      return r.ok ? r.video : undefined;
    },
    zoomSheet: async (jpegs, crops) => {
      const plan = contactSheetPlan(jpegs.length, 16 / 9);
      const r = await host().call({ op: "sheet", jpegs, crops, columns: plan.columns, cellWidth: plan.cellWidth, cellHeight: plan.cellHeight }, 20_000);
      return r.ok ? r.jpeg : undefined;
    },
  };
}
