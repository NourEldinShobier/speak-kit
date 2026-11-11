import { describe, expect, it } from "vite-plus/test";
import { LOOK_ERROR_CODES, parseLookError, parseLookRequest, parseScreenLook } from "./screen-look";

const look = { image: "/9j/", width: 1280, height: 800, text: "Hello", ocr: "ok", target: "Notes", scope: "window" };

describe("screen look schemas", () => {
  it("accepts a request with a session id and a scope", () => {
    expect(parseLookRequest({ session: "s1", scope: "screen" })).toEqual({ session: "s1", scope: "screen" });
  });

  it.each([{}, { session: "", scope: "window" }, { session: "s", scope: "desktop" }, { session: "x".repeat(65), scope: "window" }, { session: 1, scope: "window" }, null])(
    "rejects the request %j",
    (body) => {
      expect(parseLookRequest(body)).toBeUndefined();
    },
  );

  it("accepts a look, with or without the black flag", () => {
    expect(parseScreenLook(look)).toEqual(look);
    expect(parseScreenLook({ ...look, image: "", black: "black" })?.black).toBe("black");
  });

  it.each([{ ...look, ocr: "maybe" }, { ...look, black: "dark" }, { ...look, width: "wide" }, { text: "only" }])("rejects the look %j", (body) => {
    expect(parseScreenLook(body)).toBeUndefined();
  });

  it("reads the code of an error body on any shape that has one", () => {
    for (const code of LOOK_ERROR_CODES) expect(parseLookError({ code, error: { code, message: "m" } })).toBe(code);
    expect(parseLookError({ code: "no-key" })).toBeUndefined();
    expect(parseLookError("declined")).toBeUndefined();
  });
});
