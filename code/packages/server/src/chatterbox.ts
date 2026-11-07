import { access } from "node:fs/promises";
import { join } from "node:path";
import { ChatterboxEngine, type ChatterboxOptions } from "@speakkit/engine";

/**
 * Engine files live in `<dataDir>/engines/chatterbox`, so one folder holds everything an uninstall removes. An install made before that
 * keeps its `<dataDir>/chatterbox` folder: a Python virtualenv records absolute paths and cannot be moved.
 */
export async function chatterboxDir(dataDir: string): Promise<string> {
  const legacy = join(dataDir, "chatterbox");
  return access(legacy).then(
    () => legacy,
    () => join(dataDir, "engines", "chatterbox"),
  );
}

/** The optional Chatterbox engine (files see `chatterboxDir`) and cloned voices under `<dataDir>/voices`. */
export async function createChatterbox(dataDir: string, o: Partial<ChatterboxOptions> = {}): Promise<ChatterboxEngine> {
  return ChatterboxEngine.create({ dir: await chatterboxDir(dataDir), voicesDir: join(dataDir, "voices"), ...o });
}
