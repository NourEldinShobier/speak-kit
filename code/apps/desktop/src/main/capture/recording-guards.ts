import { noticeFor, type Notice, type NoticeParams } from "../../shared/capture/notices";
import { createLimitTimer, MAX_CAPTURE_MS } from "./time-limit";
import { createWriteGuard } from "./write-guard";

export interface RecordingGuardDeps {
  notify(n: Notice): void;
  log(line: string): void;
  params(): NoticeParams;
  session(): { state: { phase: string }; stop(): void };
}

/** What ends a recording on its own: a disk that refuses writes, and the time limit. Both save what exists and stop. */
export function createRecordingGuards(d: RecordingGuardDeps) {
  const stopIfRecording = () => d.session().state.phase === "recording" && (d.session().stop(), true);
  const writes = createWriteGuard({ notify: d.notify, log: d.log, params: d.params, onFirstFailure: stopIfRecording });
  const limit = createLimitTimer({ ms: MAX_CAPTURE_MS, onLimit: () => d.session().state.phase === "recording" && (d.notify(noticeFor("time-limit")), stopIfRecording()) });
  return { writes, limit };
}
