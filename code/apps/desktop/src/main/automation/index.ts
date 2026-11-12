import { randomUUID } from "node:crypto";
import type { AutomationStatus } from "@speakkit/protocol";
import { AutomationFault, type AutomationHost } from "@speakkit/server";
import { estimateMs, splitSentences } from "../../shared/reader";
import type { Ctx } from "../context";
import type { createExports } from "../export/service";
import type { createReading } from "../reader/service";
import type { DictationService } from "../dictation/service";
import { createAutomationHost } from "./host";

interface Parts {
  reading: ReturnType<typeof createReading>;
  exports: ReturnType<typeof createExports>;
  dictation(): DictationService;
}

/** The automation host wired to the real reader, exports and dictation. */
export function desktopAutomation(ctx: Ctx, { reading, exports, dictation }: Parts) {
  return createAutomationHost({
    reader: {
      state: () => reading.controller.state,
      start: (text) => reading.readText(text, "text"),
      stop: () => reading.controller.command({ type: "stop" }),
    },
    split: splitSentences,
    estimateMs: (s) => estimateMs(s, ctx.config.speed),
    engineState: () => ctx.state.health?.engine.state,
    dictating: () => {
      const phase = dictation().status().phase;
      return phase === "recording" || phase === "locked";
    },
    exporter: { start: exports.start, view: exports.view },
    now: Date.now,
    newId: () => randomUUID().slice(0, 8),
  });
}

const IDLE: AutomationStatus = { status: "idle", title: "", index: 0, total: 0, elapsedMs: 0, totalMs: 0, queued: 0 };

/**
 * A host the server can be given before the desktop features exist: it answers "unsupported" until `attach` supplies the real one.
 * The server is created first (the window needs its port), the reader later.
 */
export function lateAutomation(): { host: AutomationHost; attach(h: AutomationHost): void } {
  let target: AutomationHost | null = null;
  const need = (): AutomationHost => {
    if (!target) throw new AutomationFault("unsupported");
    return target;
  };
  return {
    attach: (h) => void (target = h),
    host: {
      status: () => target?.status() ?? IDLE,
      queue: () => target?.queue() ?? { current: null, items: [] },
      speak: async (r) => need().speak(r),
      stop: (c) => need().stop(c),
      startExport: async (r) => need().startExport(r),
      exportStatus: (id) => target?.exportStatus(id),
      subscribe: (l) => (target ? target.subscribe(l) : () => {}),
    },
  };
}
