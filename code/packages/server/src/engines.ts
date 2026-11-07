import { readFileSync, renameSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as v from "valibot";
import type { EngineId, EngineInfo, EngineList } from "@speakkit/protocol";
import { EngineUnavailableError, type TtsEngine } from "@speakkit/engine";

const Persisted = v.object({ active: v.picklist(["kokoro", "chatterbox"]) });
const NAMES: Record<EngineId, string> = { kokoro: "Kokoro", chatterbox: "Chatterbox" };
const UNUSABLE = new Set(["missing", "unavailable", "installing"]);

export class UnknownEngineError extends Error {}

/** The engines this server can run and which one is selected (persisted in `<dataDir>/engine.json`). Only the active one is ever asked to load. */
export class EngineRegistry {
  #file: string;
  #engines: Partial<Record<EngineId, TtsEngine>>;
  #active: EngineId = "kokoro";
  #onSwitch: () => void;

  constructor(
    engines: Partial<Record<EngineId, TtsEngine>> & { kokoro: TtsEngine },
    dataDir: string,
    /** Called when the active engine changes, before the old one is released (the server cancels its work here). */
    onSwitch: () => void = () => {},
  ) {
    this.#engines = engines;
    this.#onSwitch = onSwitch;
    this.#file = join(dataDir, "engine.json");
    this.#active = this.#restore();
  }

  /** Reads the saved choice at startup. A file that is not valid is moved to `engine.json.bad` and the default applies. */
  #restore(): EngineId {
    let text: string;
    try {
      // oxlint-disable-next-line node/no-sync -- startup, before the server listens
      text = readFileSync(this.#file, "utf8");
    } catch {
      return "kokoro"; // no saved choice yet
    }
    let saved: v.SafeParseResult<typeof Persisted> | undefined;
    try {
      saved = v.safeParse(Persisted, JSON.parse(text));
    } catch {
      // not JSON
    }
    if (!saved?.success) return this.#quarantine();
    // A saved choice that cannot run now (GPU gone, uninstalled) falls back to Kokoro without forgetting it.
    return this.#usable(saved.output.active) ? saved.output.active : "kokoro";
  }

  #quarantine(): EngineId {
    try {
      // oxlint-disable-next-line node/no-sync -- startup, before the server listens
      renameSync(this.#file, this.#file + ".bad");
    } catch {
      // the file vanished or cannot be moved; the default still applies
    }
    return "kokoro";
  }

  get activeId(): EngineId {
    return this.#active;
  }
  get active(): TtsEngine {
    return this.#engines[this.#active]!;
  }
  all(): TtsEngine[] {
    return Object.values(this.#engines);
  }
  get(id: EngineId): TtsEngine {
    const e = this.#engines[id];
    if (!e) throw new UnknownEngineError(`no engine "${id}"`);
    return e;
  }
  /** The engine that can clone voices, if any. */
  cloner(): TtsEngine | undefined {
    return this.all().find((e) => e.clones);
  }

  #usable(id: EngineId): boolean {
    const e = this.#engines[id];
    return !!e && !UNUSABLE.has(e.status().state);
  }

  list(): EngineList {
    const engines = (Object.keys(this.#engines) as EngineId[]).map((id): EngineInfo => {
      const e = this.get(id);
      const { state, progress, detail } = e.status();
      const x = e.info?.();
      return {
        id,
        name: NAMES[id],
        state,
        ...(progress !== undefined && { progress }),
        ...(detail && { detail }),
        ...(x?.reason && { reason: x.reason }),
        optional: !!e.install,
        cloning: !!e.clones,
        ...(x?.gpu && { gpu: x.gpu }),
      };
    });
    return { active: this.#active, engines };
  }

  /** Switches the active engine and unloads the previous one once its work has ended. Does not load the new one. */
  async select(id: EngineId): Promise<void> {
    const next = this.get(id);
    const st = next.status();
    if (UNUSABLE.has(st.state)) throw new EngineUnavailableError(st.detail ?? `${NAMES[id]} is ${st.state}`, next.info?.().reason);
    const prev = this.active;
    this.#active = id;
    await mkdir(join(this.#file, ".."), { recursive: true });
    await writeFile(this.#file + ".tmp", JSON.stringify({ active: id }));
    await rename(this.#file + ".tmp", this.#file);
    if (prev !== next) {
      this.#onSwitch();
      await prev.release?.();
    }
  }

  /** Removing the active engine falls back to Kokoro first. */
  async remove(id: EngineId): Promise<void> {
    const e = this.get(id);
    if (!e.remove) return;
    if (this.#active === id) await this.select("kokoro");
    await e.remove();
  }
}
