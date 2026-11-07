import { ImportError } from "./import-error";

const MAX_ENTRIES = 10_000;
const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
const MAX_RATIO = 100;
const END_SIGNATURE = 0x06054b50;
const ENTRY_SIGNATURE = 0x02014b50;
const END_FIXED = 22;
const ENTRY_FIXED = 46;

/**
 * Reads the central directory of a zip (DOCX and EPUB are zips) before any parser inflates it: at most 10,000 entries,
 * 200 MB unpacked, ratio at most 100, and no entry name that leaves the folder it is unpacked into. The declared sizes
 * are the archive's own claim, so this stops honest bombs and path tricks, not an archive that lies about its sizes.
 */
export function checkZip(name: string, bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - END_FIXED;
  while (end >= 0 && view.getUint32(end, true) !== END_SIGNATURE) end--;
  if (end < 0) throw new ImportError("unreadable", { code: "bad-archive", args: { name } });
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count > MAX_ENTRIES) throw new ImportError("too-large", { code: "archive-too-many-parts", args: { name, count } });
  let unpacked = 0;
  let packed = 0;
  for (let i = 0; i < count; i++) {
    if (at + ENTRY_FIXED > bytes.length || view.getUint32(at, true) !== ENTRY_SIGNATURE) throw new ImportError("unreadable", { code: "bad-archive", args: { name } });
    packed += view.getUint32(at + 20, true);
    unpacked += view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const entry = new TextDecoder().decode(bytes.subarray(at + ENTRY_FIXED, at + ENTRY_FIXED + nameLength));
    const parts = entry.replaceAll("\\", "/").split("/");
    if (parts[0] === "" || /^[a-z]:/i.test(entry) || parts.includes("..")) throw new ImportError("unreadable", { code: "archive-part-outside", args: { name } });
    at += ENTRY_FIXED + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  if (unpacked > MAX_UNPACKED_BYTES || unpacked > Math.max(packed, 1) * MAX_RATIO) throw new ImportError("too-large", { code: "archive-too-big", args: { name } });
}
