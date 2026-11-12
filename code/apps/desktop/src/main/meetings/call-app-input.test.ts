import { describe, expect, it } from "vite-plus/test";
import { callAppInput } from "./service";

const inputs = [
  { id: "default", label: "Microphone (Default)", isDefault: true },
  { id: "abc", label: "MacBook Pro Microphone", isDefault: false },
];
const ports = (name: string | null) => ({
  platform: { callAppMic: async () => name },
  devices: async () => ({ inputs, outputs: [] }),
});

describe("call app microphone", () => {
  it("turns the name the system gives into the device id the page opens, ignoring case and spaces", async () => {
    expect(await callAppInput(ports("  macbook pro microphone ") as never, () => 5)).toBe("abc");
  });

  it("says nothing for a recording started by hand, an unknown name or a system that cannot say", async () => {
    expect(await callAppInput(ports("x") as never, () => undefined)).toBeNull();
    expect(await callAppInput(ports("Studio Mic") as never, () => 5)).toBeNull();
    expect(await callAppInput(ports(null) as never, () => 5)).toBeNull();
    expect(await callAppInput(ports("") as never, () => 5)).toBeNull();
  });
});
