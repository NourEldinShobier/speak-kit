import type { RecorderData } from "../../shared/capture/contract";
import { writeStreamed, type Bundle } from "./bundle";
import type { Fence } from "./fence";
import type { WriteGuard } from "./write-guard";

export interface DataSinkDeps {
  fence: Fence;
  writes: Pick<WriteGuard, "failures" | "watch">;
  bundle(): Bundle;
  /** The capture that is on now. */
  id(): string | undefined;
  log(line: string): void;
}

/** What the recorder window streams back goes to the files of the capture that is on, unless it belongs to another recording or the disk is already refusing writes. */
export function createDataSink(d: DataSinkDeps): (data: RecorderData) => void {
  return (data) => {
    if (!d.fence.accepts(data.gen)) {
      d.fence.refuse();
      if (d.fence.refused === 1) d.log("capture: data of an earlier recording was refused");
      return;
    }
    const id = d.id();
    // while the disk is refusing writes nothing more is queued
    if (id && d.writes.failures === 0) d.writes.watch(writeStreamed(d.bundle(), id, data));
  };
}
