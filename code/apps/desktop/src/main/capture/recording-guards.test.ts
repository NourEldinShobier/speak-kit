import { describe, expect, it } from "vitest";
import type { Notice } from "../../shared/capture/notices";
import { createRecordingGuards } from "./recording-guards";

const setup = (phase: string) => {
  const notices: Notice[] = [];
  const stops: number[] = [];
  const session = { state: { phase }, stop: () => void stops.push(1) };
  const g = createRecordingGuards({ notify: (n) => notices.push(n), log: () => {}, params: () => ({}), session: () => session });
  return { g, notices, stops, session };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("recording guards", () => {
  it("a failed write stops a recording that is running", async () => {
    const { g, stops, notices } = setup("recording");
    g.writes.watch(Promise.reject(new Error("EIO")));
    await flush();
    expect(stops).toEqual([1]);
    expect(notices.map((n) => n.code)).toEqual(["write-failed"]);
  });
  it("a failed write while the capture is already finishing does not stop it a second time", async () => {
    const { g, stops } = setup("finishing");
    g.writes.watch(Promise.reject(new Error("EIO")));
    await flush();
    expect(stops).toEqual([]);
  });
});
