import { describe, expect, it } from "vite-plus/test";
import { closedDrawer, drawerPosition, drawerReducer, type DrawerState } from "./drawer";

const ids = ["af_heart", "af_bella", "am_adam"];
const open = (id: string): DrawerState => ({ kind: "open", id });

describe("drawerReducer", () => {
  it("opens on a voice and closes", () => {
    expect(drawerReducer(closedDrawer, { type: "open", id: "af_bella" })).toEqual(open("af_bella"));
    expect(drawerReducer(open("af_bella"), { type: "close" })).toEqual({ kind: "closed" });
  });

  it("opening another voice while open replaces the voice", () => {
    expect(drawerReducer(open("af_heart"), { type: "open", id: "am_adam" })).toEqual(open("am_adam"));
  });

  it("moves to the next and the previous voice of the list", () => {
    expect(drawerReducer(open("af_heart"), { type: "next", ids })).toEqual(open("af_bella"));
    expect(drawerReducer(open("am_adam"), { type: "prev", ids })).toEqual(open("af_bella"));
  });

  it("stays on the first voice going back and on the last going forward", () => {
    expect(drawerReducer(open("af_heart"), { type: "prev", ids })).toEqual(open("af_heart"));
    expect(drawerReducer(open("am_adam"), { type: "next", ids })).toEqual(open("am_adam"));
  });

  it("ignores prev and next when closed or when the voice left the list", () => {
    expect(drawerReducer(closedDrawer, { type: "next", ids })).toEqual({ kind: "closed" });
    expect(drawerReducer(open("gone"), { type: "prev", ids })).toEqual(open("gone"));
  });
});

describe("drawerPosition", () => {
  it("is the 1-based place of the open voice in the list, or null", () => {
    expect(drawerPosition(open("af_bella"), ids)).toBe(2);
    expect(drawerPosition(open("gone"), ids)).toBeNull();
    expect(drawerPosition(closedDrawer, ids)).toBeNull();
  });
});
