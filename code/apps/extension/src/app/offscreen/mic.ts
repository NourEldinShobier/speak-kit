import type { VoiceProblem } from "@speakkit/protocol";
import { micProblem } from "../../features/voicechat";

/**
 * The microphone: the browser's if the extension may already use it; otherwise the permission window is asked (`askWindow` resolves to its
 * answer) and the microphone taken again. Resolves to the stream, or to the problem to show. `fake()` makes tests fail the grab with that error name (asked again at each grab: the permission window may clear it).
 */
export async function openMicrophone(o: { fake(): string | null; askWindow(): Promise<boolean> }): Promise<MediaStream | VoiceProblem> {
  const grab = async () => {
    const fake = o.fake();
    if (fake) throw new DOMException("simulated", fake);
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  };
  try {
    return await grab();
  } catch (e) {
    if ((e as DOMException).name !== "NotAllowedError") return micProblem(e);
  }
  if (!(await o.askWindow())) return "mic-blocked";
  return grab().catch(micProblem);
}
