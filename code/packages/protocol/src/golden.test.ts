import { describe, expect, it } from "vite-plus/test";
import type { CloneVoiceRequest, ExportRequest, HoldRequest, SelectEngineRequest, SpeakRequest, UpdateVoiceRequest } from "./index";
import { FrameDecoder, encodeFrame, type FrameHeader } from "./frames";

const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Committed bytes of every frame type. A change to any of them is a wire change and needs an API_VERSION decision. */
const FRAMES: { name: string; header: FrameHeader; pcm?: number[]; hex: string }[] = [
  {
    name: "audio",
    header: { type: "audio", index: 2, sampleRate: 24000, samples: 3, durationMs: 125 },
    pcm: [0, 16383, -32768],
    hex: "4a0000007b2274797065223a22617564696f222c22696e646578223a322c2273616d706c6552617465223a32343030302c2273616d706c6573223a332c226475726174696f6e4d73223a3132357d0000ff3f0080",
  },
  { name: "done", header: { type: "done", count: 3 }, hex: "190000007b2274797065223a22646f6e65222c22636f756e74223a337d" },
  {
    name: "error synthesis-failed",
    header: { type: "error", code: "synthesis-failed", message: "boom" },
    hex: "3b0000007b2274797065223a226572726f72222c22636f6465223a2273796e7468657369732d6661696c6564222c226d657373616765223a22626f6f6d227d",
  },
  {
    name: "error engine-not-ready",
    header: { type: "error", code: "engine-not-ready", message: "loading" },
    hex: "3e0000007b2274797065223a226572726f72222c22636f6465223a22656e67696e652d6e6f742d7265616479222c226d657373616765223a226c6f6164696e67227d",
  },
];

describe("golden frames", () => {
  it.each(FRAMES)("$name encodes to the committed bytes", ({ header, pcm, hex }) => {
    expect(toHex(encodeFrame(header, pcm && Int16Array.from(pcm)))).toBe(hex);
  });

  it.each(FRAMES)("$name decodes from the committed bytes", ({ header, pcm, hex }) => {
    const frames = new FrameDecoder().push(fromHex(hex));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.header).toEqual(header);
    expect(frames[0]!.pcm && Array.from(frames[0]!.pcm)).toEqual(pcm);
  });
});

/** One body per route that takes one. The typed literal fails to compile when a field is renamed or removed. */
describe("golden request bodies", () => {
  const speak: SpeakRequest = { sentences: ["Hello there.", "Second one."], voice: "af_heart", speed: 1.2 };
  const hold: HoldRequest = { ms: 600000 };
  const select: SelectEngineRequest = { id: "chatterbox" };
  const clone: CloneVoiceRequest = { name: "Mine", consent: true, gender: "female", audio: "UklGRg==" };
  const update: UpdateVoiceRequest = { name: "Maya", exaggeration: 0.7, pace: 0.4 };
  const exportReq: ExportRequest = { sentences: ["One."], voice: "af_heart", speed: 1, gapMs: 250 };

  it.each([
    ["POST /v1/speak", speak, '{"sentences":["Hello there.","Second one."],"voice":"af_heart","speed":1.2}'],
    ["POST /v1/engine/hold", hold, '{"ms":600000}'],
    ["POST /v1/engines/select", select, '{"id":"chatterbox"}'],
    ["POST /v1/voices/clone", clone, '{"name":"Mine","consent":true,"gender":"female","audio":"UklGRg=="}'],
    ["PATCH /v1/voices/<id>", update, '{"name":"Maya","exaggeration":0.7,"pace":0.4}'],
    ["POST /v1/export", exportReq, '{"sentences":["One."],"voice":"af_heart","speed":1,"gapMs":250}'],
  ])("%s", (_route, body, json) => {
    expect(JSON.stringify(body)).toBe(json);
    expect(JSON.parse(json)).toEqual(body);
  });
});
