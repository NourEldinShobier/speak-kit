import { describe, expect, it, vi } from "vite-plus/test";

const applied: Record<string, unknown>[] = [];
const answer = { current: { ok: true } as { ok: true } | { ok: false; message: string } };

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = {};
});

import { patchViaRegistry } from "./registry-patch";

const fake = () => {
  (globalThis as unknown as { window: unknown }).window = {
    speakkit: {
      applySettings: async (c: Record<string, unknown>) => {
        applied.push(c);
        return answer.current;
      },
    },
  };
};

describe("patchViaRegistry", () => {
  it("sends the keys named under the area, then reads the status", async () => {
    fake();
    applied.length = 0;
    answer.current = { ok: true };
    expect(await patchViaRegistry("meetings", { summary: true, folder: "x" }, { status: async () => "status" })).toBe("status");
    expect(applied).toEqual([{ "meetings.summary": true, "meetings.folder": "x" }]);
  });

  it("throws what the registry refused with", async () => {
    fake();
    answer.current = { ok: false, message: "meetings.summary: bad" };
    await expect(patchViaRegistry("meetings", { summary: "x" }, { status: async () => 1 })).rejects.toThrow("meetings.summary: bad");
  });

  it("returns the status when it already explains the refusal", async () => {
    fake();
    answer.current = { ok: false, message: "That shortcut is already used by Paste last dictation." };
    expect(await patchViaRegistry("dictation", { hotkey: "x" }, { status: async () => ({ rejected: true }), explained: (s) => s.rejected })).toEqual({ rejected: true });
  });
});
