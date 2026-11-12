import { noticeFor, noticeOfError, type Notice, type NoticeParams } from "../../shared/capture/notices";

export interface WriteGuardDeps {
  notify(n: Notice): void;
  log(line: string): void;
  params?(): NoticeParams;
  /** The first failed write of a capture: the recording is ending, since more chunks would only queue in memory. */
  onFirstFailure?(): void;
}

export interface WriteGuard {
  /** Watches a write nobody awaits. A rejection is logged and counted; the first one of a capture raises a notice. */
  watch(write: Promise<unknown>): void;
  /** Failed writes since the last reset. */
  readonly failures: number;
  /** A new capture starts: the count and the notice begin again. */
  reset(): void;
}

/** Frames, video and audio stream to disk without anyone waiting for them; this makes a full or removed disk visible instead of an unhandled rejection. */
export function createWriteGuard(d: WriteGuardDeps): WriteGuard {
  let failures = 0;
  return {
    watch(write) {
      write.catch((e: unknown) => {
        failures++;
        d.log(`capture write failed (${failures}): ${e instanceof Error ? e.message : String(e)}`);
        if (failures === 1) {
          const n = noticeOfError(e, d.params?.());
          d.notify(n.code === "failed" ? noticeFor("write-failed", d.params?.()) : n);
          d.onFirstFailure?.();
        }
      });
    },
    get failures() {
      return failures;
    },
    reset() {
      failures = 0;
    },
  };
}
