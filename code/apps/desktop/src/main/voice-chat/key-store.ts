import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";

/** The part of Electron's safeStorage the store uses. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
  /** Linux only: "basic_text" means the key is not protected by the desktop's keyring. */
  getSelectedStorageBackend?(): string;
}

/**
 * The OpenAI API key, encrypted by the operating system (DPAPI, Keychain, libsecret) and kept as one blob in the data folder.
 * Plain text never touches the disk: when the OS cannot encrypt, saving is refused. The key is decrypted per use and not kept.
 */
export class KeyStore {
  #file: string;
  #safe: SafeStorageLike;
  constructor(file: string, safe: SafeStorageLike) {
    this.#file = file;
    this.#safe = safe;
  }

  canEncrypt(): boolean {
    return this.#safe.isEncryptionAvailable() && this.#safe.getSelectedStorageBackend?.() !== "basic_text";
  }

  async has(): Promise<boolean> {
    return stat(this.#file).then(
      (s) => s.isFile(),
      () => false,
    );
  }

  /** Encrypts and writes the key (owner-only file where the OS supports modes). Returns false, writing nothing, when encryption is unavailable. */
  async save(key: string): Promise<boolean> {
    if (!this.canEncrypt()) return false;
    const tmp = `${this.#file}.tmp`;
    try {
      await writeFile(tmp, this.#safe.encryptString(key), { mode: 0o600 });
      await chmod(tmp, 0o600);
      await rename(tmp, this.#file);
    } catch (e) {
      await rm(tmp, { force: true }); // an encrypted key must not stay behind half-saved
      throw e;
    }
    return true;
  }

  /** The decrypted key, or null when none is saved or it cannot be decrypted (another user or computer). Do not store the result. */
  async read(): Promise<string | null> {
    if (!this.canEncrypt()) return null;
    try {
      return this.#safe.decryptString(await readFile(this.#file));
    } catch {
      return null;
    }
  }

  async remove(): Promise<void> {
    await rm(this.#file, { force: true });
    await rm(`${this.#file}.tmp`, { force: true });
  }
}
