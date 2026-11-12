import { describe, expect, it } from "vite-plus/test";
import { CLI_FLAG, isCliLaunch } from "./cli-mode";

describe("isCliLaunch", () => {
  it("is true only when the flag is the first argument after the executable", () => {
    expect(isCliLaunch(["/Applications/Speak Kit.app/Contents/MacOS/Speak Kit", CLI_FLAG, "history"])).toBe(true);
    expect(isCliLaunch(["Speak Kit", "history", CLI_FLAG])).toBe(false);
    expect(isCliLaunch(["Speak Kit"])).toBe(false);
    expect(isCliLaunch([])).toBe(false);
  });
});
