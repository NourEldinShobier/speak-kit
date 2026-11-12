import { describe, expect, it, vi } from "vite-plus/test";

const calls = vi.hoisted(() => {
  const log: [string, unknown][] = [];
  (globalThis as { window?: unknown }).window = {
    speakkit: {
      applySettings: async (c: unknown) => {
        log.push(["applySettings", c]);
        return { ok: true };
      },
    },
    speakkitDictation: {
      status: async () => ({ rejected: undefined }),
      patchSettings: async (p: unknown) => {
        log.push(["patchSettings", p]);
        return { rejected: undefined };
      },
    },
  };
  return log;
});

import { patchDictation } from "./api";

describe("patchDictation", () => {
  it("changes dictation settings through the registry under dictation.<key>", async () => {
    calls.length = 0;
    await patchDictation({ language: "en", sentencePause: true });
    expect(calls).toEqual([["applySettings", { "dictation.language": "en", "dictation.sentencePause": true }]]);
  });

  it("passes an empty patch on as it is: it only dismisses the reset notice", async () => {
    calls.length = 0;
    await patchDictation({});
    expect(calls).toEqual([["patchSettings", {}]]);
  });
});
