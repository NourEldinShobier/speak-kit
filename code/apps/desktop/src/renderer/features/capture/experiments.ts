import { useEffect, useState } from "react";
import type { CaptureStatus } from "../../../shared/capture/contract";
import type { ExperimentId } from "../../../shared/capture/settings";
import { registerExperiment, type ExperimentState } from "../experiments";
import { capture } from "./api";

/** The state of one capture experiment: read once, then kept in step with the pushes from the main process. */
function useCaptureExperiment(id: ExperimentId): ExperimentState {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  useEffect(() => {
    let live = true;
    void capture.status().then((s) => live && setStatus(s));
    const off = capture.onStatus((s) => setStatus(s));
    return () => {
      live = false;
      off();
    };
  }, []);
  return {
    ready: !!status,
    on: !!status?.settings.experiments[id],
    set: async (on) => {
      setStatus(await capture.patchSettings({ experiments: { [id]: on } }));
    },
  };
}

const GROUP = {
  group: "Capture",
  groupLead: "More ways to capture the screen. Capture itself is in the Capture menu.",
  groupNote: "Capture has not yet been checked on every Windows 11 setup. The release notes list what was and was not tested.",
} as const;

/** Adds the capture cards to the Experiments page. */
export function registerCaptureExperiments(): void {
  registerExperiment({
    ...GROUP,
    id: "capture-screenshots",
    title: "Screenshots with a corner card",
    description: "A shortcut takes a picture of an area, a window or a screen, copies it and shows a small card in the corner.",
    badges: ["New", "Experimental"],
    guard: "The system already has its own screenshot shortcut. This adds the card and saves the picture to a folder.",
    useState: () => useCaptureExperiment("screenshots"),
  });

  registerExperiment({
    ...GROUP,
    id: "capture-agent-context",
    title: "Agent context text",
    description: "When a recording ends, Speak Kit lists the names of the buttons, menus and fields in the window in front and sends them with the capture to Voice chat.",
    badges: ["Experimental"],
    guard: "Names only, never what is typed in a field. Password fields are skipped. Off until you turn it on; on a Mac, Speak Kit asks for Accessibility access first.",
    useState: () => useCaptureExperiment("agentContext"),
  });

  registerExperiment({
    ...GROUP,
    id: "capture-speech-engines",
    title: "Your own speech engine for narration",
    description: "Make the words of a capture with a command you choose instead of the dictation model. Pick it under Capture settings.",
    badges: ["Experimental"],
    guard: "The recorded speech is written to a temporary file and handed to that program, nothing else. It is removed afterwards.",
    useState: () => useCaptureExperiment("speechEngines"),
  });

  registerExperiment({
    ...GROUP,
    id: "capture-playground",
    title: "Playground",
    description: "A page in Capture that shows every capsule state with sample data, for people building on Speak Kit.",
    badges: ["Developer"],
    useState: () => useCaptureExperiment("playground"),
  });
}
