/**
 * Voice cloning on the Voices page: the clone flow (choose or record a reference, check it, name and test the voice), the list of
 * cloned voices with preview, style and delete, and the unavailable state when Chatterbox is not installed.
 * Does not start engines or store audio itself: every action goes through the preload API, and the clip lives in memory until the voice is saved.
 * The flow is loaded when it is first opened, so the app window does not carry the recorder and the audio decoder at start-up.
 * Area: desktop renderer.
 */
import { lazy, Suspense, type ComponentProps } from "react";

export { cloningAvailability } from "./availability";
export { ClonedVoices } from "./ClonedVoices";
export { CloneButton, CloningUnavailable } from "./Entry";

const Flow = lazy(() => import("./CloneFlow").then((m) => ({ default: m.CloneFlow })));

export function CloneFlow(props: ComponentProps<typeof Flow>) {
  return (
    <Suspense fallback={null}>
      <Flow {...props} />
    </Suspense>
  );
}
