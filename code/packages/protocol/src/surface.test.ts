import { describe, expect, it } from "vite-plus/test";
import * as protocol from "./index";

describe("protocol runtime surface", () => {
  it("exports exactly these names", () => {
    expect(Object.keys(protocol).sort()).toEqual([
      "API_VERSION",
      "APP_ID",
      "CLONE_MAX_MS",
      "CLONE_MIN_MS",
      "CLONE_MIN_RATE",
      "DEFAULT_PORT",
      "DEFAULT_SENTENCE_COLOR",
      "DEFAULT_VOICE",
      "DEFAULT_WORD_COLOR",
      "ERROR_CODES",
      "FRAMES_CONTENT_TYPE",
      "FrameDecoder",
      "LOOPBACK_HOST",
      "MAX_SPEED",
      "MIN_SPEED",
      "SAMPLE_RATE",
      "SETTINGS_KEY",
      "TOKEN_KEY",
      "clock",
      "compareNames",
      "defaultSettings",
      "encodeFrame",
      "engineListSchema",
      "errorBodySchema",
      "exportJobSchema",
      "floatToInt16",
      "healthSchema",
      "parseHealth",
      "parseVoiceList",
      "plural",
      "voiceListSchema",
    ]);
  });
});
