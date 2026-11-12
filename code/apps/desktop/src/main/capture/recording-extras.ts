import type { Ctx } from "../context";
import { createCaptureContext } from "./context/combined";
import { createLiveSession } from "./live-narrator";
import { createPointerTrack } from "./pointer";
import type { CapturePlatform } from "./platform/types";
import type { Narrator } from "./recording";

/** What a recording collects besides its picture, sound and input events: the context text, the words made while it goes on, and where the pointer was. */
export function createRecordingExtras(o: { ctx: Ctx; platform: CapturePlatform; narrator: Narrator; clicks?: ((onClick: () => void) => () => void) | undefined }) {
  const { ctx, platform, narrator, clicks } = o;
  const settings = () => ctx.config.capture;
  return {
    context: createCaptureContext({ settings, os: platform.os, pageEvents: (from, to) => ctx.server.pageEvents(from, to) }),
    live: createLiveSession({ settings, narrator, log: (l) => ctx.log.warn(l) }),
    pointer: createPointerTrack({ cursor: () => platform.cursor(), now: Date.now, enabled: () => settings().inputLog === "events", ...(clicks && { clicks }) }),
  };
}
