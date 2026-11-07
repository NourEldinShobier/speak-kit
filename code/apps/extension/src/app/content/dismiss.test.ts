import { describe, expect, test } from "vite-plus/test";
import { OPEN, reduceTabUi } from "./dismiss";

const closed = reduceTabUi(OPEN, { t: "close", docId: "d1" });

describe("tab UI dismissal", () => {
  test("close hides the UI and remembers the document that was read", () => {
    expect(closed).toEqual({ dismissed: true, closedDoc: "d1" });
  });
  test("a late state of the closed reading keeps it hidden", () => {
    expect(reduceTabUi(closed, { t: "state", active: true, docId: "d1" })).toBe(closed);
  });
  test("an idle state keeps it hidden", () => {
    expect(reduceTabUi(closed, { t: "state", active: false, docId: "d1" })).toBe(closed);
  });
  test("a different reading in this tab brings the UI back", () => {
    expect(reduceTabUi(closed, { t: "state", active: true, docId: "d2" })).toEqual({ dismissed: false });
  });
  test("restore (shortcut, menu, popup, icon) brings the UI back", () => {
    expect(reduceTabUi(closed, { t: "restore" })).toEqual({ dismissed: false });
  });
  test("states do not change an open UI", () => {
    expect(reduceTabUi(OPEN, { t: "state", active: true, docId: "d2" })).toBe(OPEN);
  });
  test("closing with nothing playing still hides it", () => {
    expect(reduceTabUi(OPEN, { t: "close" })).toEqual({ dismissed: true });
  });
});
