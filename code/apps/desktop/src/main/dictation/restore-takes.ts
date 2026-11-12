import type { Dictation } from "@speakkit/dictation";
import type { Spool } from "./spool";
import type { SpooledRecorder } from "./spooled-recorder";

/**
 * Runs the takes a stopped app left on disk through dictation, oldest first. Each is removed when its dictation reports it done; one the speech
 * engine could not read stays, up to the spool's limit of tries. Resolves with how many takes were found.
 */
export async function restoreTakes(spool: Spool, spooled: SpooledRecorder, core: Dictation): Promise<number> {
  const found = await spool.recover();
  for (const take of found) {
    spooled.adopt(take.clip, take.id);
    core.restore(take.clip);
  }
  return found.length;
}
