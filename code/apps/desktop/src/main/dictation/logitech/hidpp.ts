/** HID++ 2.0 frames (Logitech's protocol for mouse buttons, battery, DPI), long reports only. Pure: no I/O. */

export const SOFTWARE_ID = 7;
export const REPORT_LONG = 0x11;
export const FRAME_LENGTH = 20;
export const FEATURE_ROOT = 0;
export const REPROG_CONTROLS_V4 = 0x1b04;
/** Direct Bluetooth LE devices answer on this index; a receiver numbers its paired devices from 1. */
export const DEVICE_INDEXES = [0xff, 0x00, 0x01] as const;

export function encodeRequest({ index, feature, fn, params = [] }: { index: number; feature: number; fn: number; params?: readonly number[] }): number[] {
  const frame = Array.from({ length: FRAME_LENGTH }, () => 0);
  frame[0] = REPORT_LONG;
  frame[1] = index;
  frame[2] = feature;
  frame[3] = (fn << 4) | SOFTWARE_ID;
  params.forEach((b, i) => (frame[4 + i] = b));
  return frame;
}

export type MessageFrame = { kind: "message"; feature: number; fn: number; sw: number; params: number[] };
/** The device refused the request for `feature`; `code` is its HID++ error number. */
export type ErrorFrame = { kind: "error"; feature: number; sw: number; code: number };
/** A message is an answer to a request (`sw` is our software id) or a notification the device sends by itself (`sw` 0). */
export type Frame = MessageFrame | ErrorFrame;

/** Null for anything that is not a long HID++ report. */
export function decodeFrame(bytes: ArrayLike<number>): Frame | null {
  if (bytes.length < FRAME_LENGTH || bytes[0] !== REPORT_LONG) return null;
  const b = Array.from(bytes);
  if (b[2] === 0xff) return { kind: "error", feature: b[3]!, sw: b[4]! & 0x0f, code: b[5]! };
  return { kind: "message", feature: b[2]!, fn: b[3]! >> 4, sw: b[3]! & 0x0f, params: b.slice(4, FRAME_LENGTH) };
}

/** Frames with another software id are answers to other programs (OpenLogi reads the same device): not ours. */
export const isReplyTo = (f: Frame, feature: number, fn: number): f is MessageFrame => f.kind === "message" && f.sw === SOFTWARE_ID && f.feature === feature && f.fn === fn;
export const isErrorFor = (f: Frame, feature: number): f is ErrorFrame => f.kind === "error" && f.sw === SOFTWARE_ID && f.feature === feature;
/** A diverted-button event: function 0, software id 0, from the REPROG_CONTROLS_V4 feature. */
export const isButtonEvent = (f: Frame, feature: number): f is MessageFrame => f.kind === "message" && f.feature === feature && f.fn === 0 && f.sw === 0;

const word = (p: readonly number[], at: number): number => (p[at]! << 8) | p[at + 1]!;

/** The buttons held down, from the parameters of a button event (two bytes each, ended by 0). */
export function pressedCids(params: readonly number[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i + 1 < params.length; i += 2) {
    const cid = word(params, i);
    if (cid === 0) break;
    out.add(cid);
  }
  return out;
}

export interface Control {
  cid: number;
  divertable: boolean;
}

/** Answer of getControlInfo: control id, task id, flags. Bits 0x20 and 0x40 mean the control can be diverted to software. */
export const parseControl = (params: readonly number[]): Control => ({ cid: word(params, 0), divertable: (params[4]! & 0x60) !== 0 });

export const DIVERTED_TEMPORARY = 0x01;
export const DIVERTED_PERSISTENT = 0x04;
/** Answer of getCidReporting: the reporting flags of the control. */
export const parseReporting = (params: readonly number[]): number => params[2]!;

/** setCidReporting parameters: control id, the divert bit and its "apply" bit, then no remap. */
export const divertParams = (cid: number, on: boolean): number[] => [cid >> 8, cid & 0xff, on ? 0x03 : 0x02, 0, 0];
