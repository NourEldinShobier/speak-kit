import { describe, expect, it } from "vite-plus/test";
import { decodeFrame, divertParams, encodeRequest, isButtonEvent, isReplyTo, parseControl, parseReporting, pressedCids } from "./hidpp";

const frame = (...bytes: number[]) => [...bytes, ...Array.from({ length: 20 - bytes.length }, () => 0)];

describe("HID++ frames", () => {
  it("encodes a long request with the device index, feature, function and our software id", () => {
    expect(encodeRequest({ index: 0xff, feature: 13, fn: 3, params: [0x00, 0xd7, 0x03, 0, 0] })).toEqual(frame(0x11, 0xff, 13, 0x37, 0x00, 0xd7, 0x03));
  });

  it("decodes an answer into feature, function, software id and parameters", () => {
    expect(decodeFrame(frame(0x11, 0xff, 13, 0x17, 0x00, 0xd7, 0x01))).toEqual({ kind: "message", feature: 13, fn: 1, sw: 7, params: frame(0x00, 0xd7, 0x01).slice(0, 16) });
  });

  it("decodes an error answer", () => {
    expect(decodeFrame(frame(0x11, 0xff, 0xff, 13, 0x27, 0x02))).toEqual({ kind: "error", feature: 13, sw: 7, code: 2 });
  });

  it("ignores short reports and other report ids", () => {
    expect(decodeFrame([0x11, 0xff, 0])).toBeNull();
    expect(decodeFrame(frame(0x10, 0xff, 0, 0))).toBeNull();
  });

  it("tells our answers from the answers to other programs and from button events", () => {
    const ours = decodeFrame(frame(0x11, 0xff, 13, 0x27))!;
    const theirs = decodeFrame(frame(0x11, 0xff, 13, 0x25))!;
    const event = decodeFrame(frame(0x11, 0xff, 13, 0x00, 0x00, 0xc3))!;
    expect([isReplyTo(ours, 13, 2), isReplyTo(theirs, 13, 2), isReplyTo(event, 13, 2)]).toEqual([true, false, false]);
    expect([isButtonEvent(event, 13), isButtonEvent(ours, 13), isButtonEvent(event, 12)]).toEqual([true, false, false]);
  });

  it("reads the held buttons up to the first zero", () => {
    expect([...pressedCids([0x00, 0xc3, 0x00, 0x52, 0x00, 0x00, 0x01, 0xa0])]).toEqual([0xc3, 0x52]);
    expect(pressedCids([0, 0, 0, 0]).size).toBe(0);
  });

  it("reads a control: id, and divertable from flag bits 0x20 and 0x40", () => {
    expect(parseControl([0x00, 0xd7, 0x00, 0x57, 0x20])).toEqual({ cid: 0xd7, divertable: true });
    expect(parseControl([0x00, 0x50, 0x00, 0x38, 0x04])).toEqual({ cid: 0x50, divertable: false });
    expect(parseControl([0x01, 0xa0, 0x00, 0x00, 0x40])).toEqual({ cid: 0x01a0, divertable: true });
  });

  it("builds the divert and undivert parameters and reads reporting flags", () => {
    expect(divertParams(0x01a0, true)).toEqual([0x01, 0xa0, 0x03, 0, 0]);
    expect(divertParams(0xc3, false)).toEqual([0x00, 0xc3, 0x02, 0, 0]);
    expect(parseReporting([0x00, 0xc3, 0x05])).toBe(5);
  });
});
