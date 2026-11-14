import { useEffect, useReducer } from "react";
import { Modal } from "@speakkit/ui";
import type { ExportConflict, ExportView } from "../../../shared/export";
import type { AppState } from "../../../shared/ipc";
import type { MP3_KBPS } from "../../../shared/schemas";
import { useT } from "../../i18n";
import { api, cleanError } from "../../ui";
import { doneView, endedView, renderingView } from "./JobViews";
import { existsView, optionsView, type ViewProps } from "./OptionsView";
import { exportReducer, exportTitle, exportViewKind, initExport, type ExportAction, type ExportOpen, type ExportState } from "./model";

/** Checks the target, asks about an existing file, and starts the job; every outcome goes through the reducer. */
async function startExport({ s, st, dispatch }: { s: AppState; st: ExportState; dispatch: (a: ExportAction) => void }, conflict?: ExportConflict) {
  const { form } = st;
  dispatch({ type: "attempt" });
  try {
    const target = await api.exportCheck(form.dir, form.name, form.format);
    if (target.exists && !conflict) return dispatch({ type: "exists", target });
    if (st.phase.kind === "exists") dispatch({ type: "back-to-options" });
    const v = await api.exportStart({
      text: form.text,
      voice: form.voice,
      speed: s.config.speed,
      format: form.format,
      mp3Kbps: form.kbps as (typeof MP3_KBPS)[number],
      dir: form.dir,
      name: form.name,
      captions: form.captions,
      chapters: form.format === "mp3" && form.chapters,
      ...(target.exists && conflict ? { conflict } : {}),
    });
    dispatch({ type: "started", jobId: v.id });
  } catch (e) {
    dispatch({ type: "failed", message: cleanError(e) });
  }
}

function useExport(s: AppState, open: ExportOpen) {
  const [st, dispatch] = useReducer(exportReducer, undefined, () => initExport(s, open));
  useEffect(() => {
    api.voices().then(
      (v) => dispatch({ type: "voices", voices: v.voices }),
      () => {},
    );
  }, []);
  return { st, dispatch, start: (conflict?: ExportConflict) => void startExport({ s, st, dispatch }, conflict) };
}

function jobView(p: ViewProps, job: ExportView) {
  const jobProps = { job, onClose: p.onClose, dispatch: p.dispatch, t: p.t };
  if (job.stage === "done") return doneView(jobProps);
  if (job.stage === "error" || job.stage === "cancelled") return endedView(jobProps);
  return renderingView(jobProps);
}

function selectView(p: ViewProps, job: ExportView | undefined) {
  const kind = exportViewKind(p.st.phase, job);
  if (job && p.st.phase.kind === "job") return { kind, ...jobView(p, job) };
  if (p.st.phase.kind === "exists") return { kind, ...existsView({ dispatch: p.dispatch, start: p.start, t: p.t, target: p.st.phase.target }) };
  return { kind, ...optionsView(p) };
}

/** Export audio: options, "file exists", rendering with progress, done. Closing while it renders keeps it running in the background. */
export function ExportDialog({ s, open, onClose }: { s: AppState; open: ExportOpen; onClose(): void }) {
  const { t } = useT();
  const { st, dispatch, start } = useExport(s, open);
  const jobId = st.phase.kind === "job" ? st.phase.id : null;
  const { kind, body, footer } = selectView(
    { s, st, dispatch, start, onClose, t },
    s.exports.find((e) => e.id === jobId),
  );
  return (
    <Modal open onClose={onClose} title={exportTitle(kind, t)} width={560} footer={footer}>
      {body}
    </Modal>
  );
}
