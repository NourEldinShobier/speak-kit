import { createConsentCard } from "./card";
import { createIndicator } from "./indicator";
import { createLook } from "./look";
import { createOcr, noOcr } from "./ocr";
import { createElectronPlatform } from "./platform";

/**
 * Screen vision of the voice chat: one look at the window or screen on the model's request. The extension asks through
 * POST /v1/voice-chat/look; the user is asked once per conversation, a notice shows while it looks, nothing is stored.
 * Windows looks at the screen or a window and reads its text; macOS looks at the screen only, without text; elsewhere `look` answers "unsupported". Area: desktop main.
 */
export function createScreenVision() {
  const ocr = process.platform === "win32" ? createOcr() : noOcr;
  const { look } = createLook({ platform: createElectronPlatform(), ocr, card: createConsentCard(), indicator: createIndicator() });
  return { look, dispose: () => ocr.dispose() };
}
