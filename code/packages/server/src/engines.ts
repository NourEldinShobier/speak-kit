import type { EngineId, EngineInfo, EngineList } from "@speakkit/protocol";
import type { TtsEngine } from "@speakkit/engine";

/** The engine this server runs. */
export class EngineRegistry {
  #kokoro: TtsEngine;

  constructor(kokoro: TtsEngine) {
    this.#kokoro = kokoro;
  }

  get activeId(): EngineId {
    return "kokoro";
  }
  get active(): TtsEngine {
    return this.#kokoro;
  }
  all(): TtsEngine[] {
    return [this.#kokoro];
  }

  list(): EngineList {
    const { state, progress, detail } = this.#kokoro.status();
    const info: EngineInfo = { id: "kokoro", name: "Kokoro", state, ...(progress !== undefined && { progress }), ...(detail && { detail }) };
    return { active: "kokoro", engines: [info] };
  }
}
