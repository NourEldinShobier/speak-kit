import { join } from "node:path";
import { ChatterboxEngine, type ChatterboxOptions } from "@speakkit/engine";

/** The optional Chatterbox engine with its files under `<dataDir>/chatterbox` and cloned voices under `<dataDir>/voices`. */
export function createChatterbox(dataDir: string, o: Partial<ChatterboxOptions> = {}): Promise<ChatterboxEngine> {
  return ChatterboxEngine.create({ dir: join(dataDir, "chatterbox"), voicesDir: join(dataDir, "voices"), ...o });
}
