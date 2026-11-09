import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { KeyStore, type SafeStorageLike } from "./key-store";

const KEY = "sk-proj-Round_Trip-0123456789abcdef";

/** Reversible stand-in for the OS: the blob is recognisable, and it is not the key. */
function fakeSafe(o: { available?: boolean; backend?: string } = {}): SafeStorageLike {
  return {
    isEncryptionAvailable: () => o.available ?? true,
    encryptString: (s) => Buffer.from(`ENC1:${Buffer.from(s).reverse().toString("base64")}`),
    decryptString: (b) => {
      const t = b.toString();
      if (!t.startsWith("ENC1:")) throw new Error("not encrypted");
      return Buffer.from(t.slice(5), "base64").reverse().toString();
    },
    ...(o.backend ? { getSelectedStorageBackend: () => o.backend! } : {}),
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "speakkit-key-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));
const file = () => path.join(dir, "voice-chat-key.bin");

describe("KeyStore", () => {
  it("saves the key encrypted and reads it back", async () => {
    const s = new KeyStore(file(), fakeSafe());
    expect(await s.has()).toBe(false);
    expect(await s.save(KEY)).toBe(true);
    expect(await s.has()).toBe(true);
    expect(await s.read()).toBe(KEY);
    const onDisk = await readFile(file());
    expect(onDisk.toString()).toMatch(/^ENC1:/);
    expect(onDisk.includes(Buffer.from(KEY))).toBe(false);
    expect(await readdir(dir)).toEqual(["voice-chat-key.bin"]); // no temp file left
  });

  it("replaces an earlier key", async () => {
    const s = new KeyStore(file(), fakeSafe());
    await s.save(KEY);
    await s.save("sk-proj-Second_key-0123456789abcdef");
    expect(await s.read()).toBe("sk-proj-Second_key-0123456789abcdef");
  });

  it("removes the key", async () => {
    const s = new KeyStore(file(), fakeSafe());
    await s.save(KEY);
    await s.remove();
    expect(await s.has()).toBe(false);
    expect(await s.read()).toBeNull();
    await s.remove(); // nothing left: still fine
  });

  it("refuses to save and writes nothing when the OS cannot encrypt", async () => {
    const s = new KeyStore(file(), fakeSafe({ available: false }));
    expect(s.canEncrypt()).toBe(false);
    expect(await s.save(KEY)).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  it("treats the Linux basic_text backend (no keyring) as unable to encrypt", async () => {
    const s = new KeyStore(file(), fakeSafe({ backend: "basic_text" }));
    expect(s.canEncrypt()).toBe(false);
    expect(await s.save(KEY)).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  it("accepts a real keyring backend on Linux", async () => {
    const s = new KeyStore(file(), fakeSafe({ backend: "gnome_libsecret" }));
    expect(await s.save(KEY)).toBe(true);
  });

  it("reads null, not an error, from a blob that cannot be decrypted", async () => {
    await new KeyStore(file(), fakeSafe()).save(KEY);
    const wrongUser: SafeStorageLike = {
      ...fakeSafe(),
      decryptString: () => {
        throw new Error("wrong user");
      },
    };
    const other = new KeyStore(file(), wrongUser);
    expect(await other.read()).toBeNull();
    expect(await other.has()).toBe(true);
  });
});
