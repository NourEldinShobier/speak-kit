import { useEffect, useState } from "react";
import type { CaptureStatus } from "../../../shared/capture/contract";
import type { ExperimentId } from "../../../shared/capture/settings";
import { registerExperiment, type ExperimentState } from "../experiments";
import { capture } from "./api";
import { PageScriptFromApp } from "./PageScript";

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
  registerCaptureKeyExperiments();
  registerLabExperiments();
}

/** The experiments that add a way to start a capture or a source for it. */
function registerCaptureKeyExperiments(): void {
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
    id: "capture-recording",
    title: "Screen recording key",
    description: "A key that starts a recording of the screen with no narration. Press it again to stop. The recording is saved with your captures.",
    badges: ["New", "Experimental"],
    guard: "The capture key keeps working as before. Narration, the pen and the capsule are the same.",
    useState: () => useCaptureExperiment("recording"),
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
    id: "capture-replay",
    title: "Replay buffer",
    description:
      "Keeps the last 15 seconds of your first screen in memory while it is on. A key saves them as a capture, so you can catch something that just happened. Turn it on under Capture settings.",
    badges: ["Experimental"],
    guard: "A pill on the screen shows while it is on. Nothing is saved or sent until you save it, and you read what it keeps before the first time.",
    useState: () => useCaptureExperiment("replay"),
  });
}

/** The experiments that change what a capture holds or how it is edited. */
function registerLabExperiments(): void {
  registerExperiment({
    ...GROUP,
    id: "capture-zoom-export",
    title: "Zoom in a recording",
    description:
      "Open a recording and show parts of its video closer, chosen by hand or suggested from where you clicked, where the pointer rested and where you drew. The zoomed copy comes with a contact sheet of the zoomed parts.",
    badges: ["Experimental"],
    guard: "The original video stays. A click is noted as a place and a time only, never what was clicked. With the input log off, no pointer positions or clicks are noted.",
    useState: () => useCaptureExperiment("zoomExport"),
  });

  registerExperiment({
    ...GROUP,
    id: "capture-page-context",
    title: "Development page context",
    description:
      "A page you are building can report what was clicked, console errors and failed requests. A capture lists them with the times, and Voice chat gets the list. Turn it on to get the script tag to add to your page.",
    badges: ["Developer", "Experimental"],
    guard: "Only pages on this computer can report, and only names: a button's text, a tag, a path. Never what is typed in a field, a request body or a cookie. Off until you turn it on.",
    Extra: PageScriptFromApp,
    useState: () => useCaptureExperiment("pageContext"),
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
