import type { EngineRegistry } from "../engines";

export const voiceIds = (engines: EngineRegistry) => new Set(engines.active.voices().map((v) => v.id));
