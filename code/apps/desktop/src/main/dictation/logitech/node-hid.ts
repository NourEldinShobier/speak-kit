import type { Transport } from "./device";

const LOGITECH = 0x046d;
/** HID++ collections: Bluetooth LE devices and wired ones use 0xff43, receivers use 0xff00 usage 2 (long reports). */
const isHidpp = (d: { vendorId: number; usagePage?: number | undefined; usage?: number | undefined }): boolean =>
  d.vendorId === LOGITECH && (d.usagePage === 0xff43 || (d.usagePage === 0xff00 && d.usage === 2));

/**
 * Opens every Logitech HID++ collection. node-hid is a native module loaded on first use; when it cannot load or nothing can be opened
 * the answer is an empty list, never an error.
 */
export async function openTransports(): Promise<Transport[]> {
  try {
    const hid = (await import("node-hid")).default;
    const out: Transport[] = [];
    for (const info of hid.devices()) {
      if (!info.path || !isHidpp(info)) continue;
      try {
        const h = new hid.HID(info.path);
        out.push({
          write: (bytes) => void h.write(bytes),
          onData: (cb) => void h.on("data", cb),
          onError: (cb) => void h.on("error", cb),
          close: () => {
            try {
              h.close();
            } catch {
              // already closed
            }
          },
        });
      } catch {
        // another program holds the collection exclusively
      }
    }
    return out;
  } catch {
    return [];
  }
}
